import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  isOperationRequestSource,
  isOperationRequestStatus,
  isSupportedOperationRequestAction,
  type AuditEntry,
  type DomainEvent,
  type HousekeepingTask,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryCalendarKind,
  type InventoryDayRoom,
  type InventoryHorizonRequest,
  type InventoryIntervalProjection,
  type InventoryReadModel,
  type InventorySellableStatus,
  type InventorySourceRef,
  type InventorySummaryDayType,
  type MaintenanceTicket,
  type OperationRequest,
  type ReservationReadModel,
  type RoomReservationContextReadModel,
  type StayStatus,
  type TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
  type CorePorts,
  type DomainEventCollector,
  type IdempotencyRepository,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsMaintenanceDoneOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckInConfirmApiRequest,
  type CheckOutApiRequest,
  type CheckOutConfirmApiRequest,
  type OperationRequestCreateApiRequest,
  type OperationRequestCreateApiResponse,
  type OperationRequestGetApiRequest,
  type OperationRequestGetApiResponse,
  type OperationRequestListApiRequest,
  type OperationRequestListApiResponse,
  type OperationRequestUpdateApiRequest,
  type OperationRequestUpdateApiResponse,
} from './index.js';
import {
  type PmsSandboxPropertyReadback,
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxReservationImportRecord,
  pmsSandboxStateVersion,
  type PmsSandboxRoomTypeReadback,
  type PmsSandboxStayReadback,
  pmsSqliteDbPathEnvName,
  type PmsLocalSandboxStore,
  type PmsLocalStorageMetadata,
  type PmsSandboxIdempotencyReadback,
  type PmsSandboxReadback,
} from './localSandbox.js';

export { pmsSqliteDbPathEnvName };

export interface CreateSqliteLocalSandboxStoreOptions {
  readonly dbPath: string;
  readonly seedRooms?: readonly RoomAggregate[];
  readonly seedReservations?: readonly PmsSandboxReservationImportRecord[];
  readonly resetOnStart?: boolean;
  readonly now?: () => string;
}

export class SqliteLocalSandboxStore implements PmsLocalSandboxStore {
  readonly storage: PmsLocalStorageMetadata = {
    kind: 'sqlite',
    envName: pmsSqliteDbPathEnvName,
    driver: 'node:sqlite',
    experimental: true,
  };
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;

  private readonly db: DatabaseSync;
  private readonly seedRooms: readonly RoomAggregate[];
  private readonly seedReservations: readonly PmsSandboxReservationImportRecord[];
  private readonly now: () => string;
  private transactionDepth = 0;
  private inventoryDirty = false;

  constructor(options: CreateSqliteLocalSandboxStoreOptions) {
    if (options.dbPath !== ':memory:') {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(options.dbPath);
    this.seedRooms = cloneValue(options.seedRooms ?? []);
    this.seedReservations = cloneValue(options.seedReservations ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
    this.migrate();
    this.bootstrap(options);
    this.ports = this.createCorePorts();
    this.apiIdempotency = this.createApiIdempotencyRepository();
  }

  readback(roomId?: string): PmsSandboxReadback {
    const horizon = this.rebuildInventory({ roomId });
    const properties = this.listProperties();
    const roomTypes = this.listRoomTypes();
    const rooms = roomId ? this.getRoomsByRoomId(roomId) : this.listRooms();
    const roomIds = new Set(rooms.map((room) => room.roomId));
    const reservations = roomId ? this.listReservationsByRoomIds(roomIds) : this.listReservations();
    const reservationAllocations = roomId ? this.listReservationAllocationsByRoomIds(roomIds) : this.listReservationAllocations();
    const stays = roomId ? this.listStaysByRoomIds(roomIds) : this.listStays();
    const housekeepingTasks = roomId ? this.listHousekeepingTasksByRoomIds(roomIds) : this.listHousekeepingTasks();
    const maintenanceTickets = roomId ? this.listMaintenanceTicketsByRoomIds(roomIds) : this.listMaintenanceTickets();
    const operationRequests = roomId ? this.listOperationRequestsByRoomIds(roomIds) : this.listOperationRequestRecords();
    const audits = roomId ? this.listAuditsByRoomIds(roomIds) : this.listAudits();
    const domainEvents = roomId ? this.listDomainEventsByRoomIds(roomIds) : this.listDomainEvents();

    return {
      ok: true,
      service: 'pms-platform',
      stateVersion: pmsSandboxStateVersion,
      generatedAt: this.now(),
      storage: this.storage,
      filter: roomId ? { roomId } : {},
      properties: cloneValue(properties),
      roomTypes: cloneValue(roomTypes),
      rooms: cloneValue(rooms),
      reservations: cloneValue(reservations),
      reservationAllocations: cloneValue(reservationAllocations),
      stays: cloneValue(stays),
      inventoryBlocks: cloneValue(horizon.blocks),
      inventoryDayRooms: cloneValue(horizon.dayRooms),
      inventoryIntervalProjection: cloneValue(horizon.intervals),
      inventorySummaryDayType: cloneValue(horizon.summaries),
      operationRequests: cloneValue(operationRequests),
      housekeepingTasks: cloneValue(housekeepingTasks),
      maintenanceTickets: cloneValue(maintenanceTickets),
      audits: cloneValue(audits),
      domainEvents: cloneValue(domainEvents),
      idempotencyRecords: this.listApiIdempotencyRecords().map((record) => ({
        operation: requestOperationFromRecord(record),
        mode: requestModeFromRecord(record),
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        ok: record.response.ok,
      })),
    };
  }

  reset(
    seedRooms: readonly RoomAggregate[] = this.seedRooms,
    seedReservations: readonly PmsSandboxReservationImportRecord[] = this.seedReservations,
  ): PmsSandboxReadback {
    this.runInTransaction(() => {
      this.clearBusinessTables();
      this.seedCatalogFromRooms(seedRooms);
      for (const room of seedRooms) {
        this.saveRoom(room);
      }
      this.importReservations(seedReservations);
    });
    return this.readback();
  }

  importReservations(reservations: readonly PmsSandboxReservationImportRecord[]) {
    return this.runInTransaction(() => {
      const imported: ReservationReadModel[] = [];
      for (const reservation of reservations) {
        imported.push(this.saveReservationImportRecord(reservation));
      }
      return {
        importedCount: imported.length,
        reservations: imported,
      };
    });
  }

  rebuildInventory(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.runInTransaction(() => this.rebuildInventoryHorizon(options));
  }

  inventoryIntervals(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  inventorySummary(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  createOperationRequest(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse {
    return this.runInTransaction(() => this.createOperationRequestRecord(request));
  }

  getOperationRequest(request: OperationRequestGetApiRequest): OperationRequestGetApiResponse {
    return {
      ok: true,
      operation: pmsOperationRequestGetOperation,
      request: cloneValue(this.findOperationRequest(request)),
    };
  }

  listOperationRequests(request: OperationRequestListApiRequest = {}): OperationRequestListApiResponse {
    const status = typeof request.status === 'string' && isOperationRequestStatus(request.status) ? request.status : undefined;
    const roomId = optionalString(request.roomId);
    const limit = operationRequestListLimit(request.limit);
    const matching = this.listOperationRequestRecords()
      .filter((entry) => !status || entry.status === status)
      .filter((entry) => !roomId || entry.roomId === roomId);
    const requests = matching.slice(0, limit);
    return {
      ok: true,
      operation: pmsOperationRequestListOperation,
      requests: cloneValue(requests),
      count: matching.length,
      truncated: matching.length > requests.length,
      updatedAt: optionalString(request.requestedAt) ?? this.now(),
      filter: {
        ...(status ? { status } : {}),
        ...(roomId ? { roomId } : {}),
        limit,
      },
    };
  }

  updateOperationRequest(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse {
    return this.runInTransaction(() => this.updateOperationRequestRecord(request));
  }

  recordCheckInStay(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() => this.recordCheckInStayFromConfirm(request, result));
  }

  recordCheckOutStay(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() => this.recordCheckOutStayFromConfirm(request, result));
  }

  runInTransaction<TValue>(operation: () => TValue): TValue {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      const result = operation();
      if (this.inventoryDirty) {
        this.rebuildInventoryHorizon();
        this.inventoryDirty = false;
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.inventoryDirty = false;
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        room_number TEXT NOT NULL,
        property_id TEXT,
        room_type_id TEXT,
        room_type TEXT,
        zone TEXT,
        sort_key TEXT,
        occupancy_status TEXT NOT NULL,
        cleaning_status TEXT NOT NULL,
        sale_status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS properties (
        property_id TEXT PRIMARY KEY,
        property_code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_types (
        room_type_id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        room_type_code TEXT NOT NULL,
        display_name TEXT NOT NULL,
        sort_key TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS housekeeping_tasks (
        task_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS maintenance_tickets (
        ticket_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS guests (
        guest_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        profile_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reservations (
        reservation_id TEXT PRIMARY KEY,
        reservation_code TEXT NOT NULL UNIQUE,
        property_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        room_id TEXT,
        room_number TEXT,
        room_type_id TEXT,
        room_type TEXT,
        arrival_date TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (guest_id) REFERENCES guests(guest_id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS reservation_room_allocations (
        allocation_id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        room_id TEXT,
        room_number TEXT,
        room_type_id TEXT,
        room_type TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stays (
        stay_id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        room_id TEXT,
        room_number TEXT,
        checked_in_at TEXT,
        checked_out_at TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS inventory_blocks (
        block_id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        room_type_id TEXT,
        block_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT,
        UNIQUE (source_type, source_id, room_id, block_type)
      );

      CREATE TABLE IF NOT EXISTS inventory_day_room (
        business_date TEXT NOT NULL,
        property_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        room_number TEXT NOT NULL,
        room_type_id TEXT,
        room_type TEXT,
        availability_status TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (business_date, room_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_interval_projection (
        projection_id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        room_number TEXT NOT NULL,
        room_type_id TEXT,
        room_type TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        calendar_kind TEXT NOT NULL,
        sellable_status TEXT NOT NULL,
        title TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_summary_day_type (
        business_date TEXT NOT NULL,
        property_id TEXT NOT NULL,
        room_type_id TEXT NOT NULL,
        room_type TEXT,
        total_rooms INTEGER NOT NULL,
        available_rooms INTEGER NOT NULL,
        occupied_rooms INTEGER NOT NULL,
        blocked_rooms INTEGER NOT NULL,
        reserved_rooms INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (business_date, property_id, room_type_id)
      );

      CREATE TABLE IF NOT EXISTS audits (
        audit_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS domain_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        room_id TEXT,
        event_type TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS core_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        mode TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operation_requests (
        operation_request_id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        client_token TEXT NOT NULL UNIQUE,
        request_fingerprint TEXT NOT NULL,
        source TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        room_id TEXT,
        room_number TEXT,
        reservation_id TEXT,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON rooms(room_number);
      CREATE INDEX IF NOT EXISTS idx_room_types_property_id ON room_types(property_id);
      CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_room_id ON maintenance_tickets(room_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON reservations(room_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_arrival_date ON reservations(arrival_date);
      CREATE INDEX IF NOT EXISTS idx_reservations_departure_date ON reservations(departure_date);
      CREATE INDEX IF NOT EXISTS idx_reservation_allocations_room_id ON reservation_room_allocations(room_id);
      CREATE INDEX IF NOT EXISTS idx_stays_room_id ON stays(room_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_blocks_room_id ON inventory_blocks(room_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_blocks_source ON inventory_blocks(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_day_room_date ON inventory_day_room(business_date);
      CREATE INDEX IF NOT EXISTS idx_inventory_interval_projection_room_id ON inventory_interval_projection(room_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_summary_day_type_date ON inventory_summary_day_type(business_date);
      CREATE INDEX IF NOT EXISTS idx_audits_room_id ON audits(room_id);
      CREATE INDEX IF NOT EXISTS idx_audits_correlation_id ON audits(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_audits_idempotency_key ON audits(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_events_room_id ON domain_events(room_id);
      CREATE INDEX IF NOT EXISTS idx_domain_events_event_type ON domain_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_operation_requests_client_token ON operation_requests(client_token);
      CREATE INDEX IF NOT EXISTS idx_operation_requests_room_id ON operation_requests(room_id);
      CREATE INDEX IF NOT EXISTS idx_operation_requests_status ON operation_requests(status);
      CREATE INDEX IF NOT EXISTS idx_domain_events_correlation_id ON domain_events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_domain_events_idempotency_key ON domain_events(idempotency_key);

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, '${escapeSqlLiteral(this.now())}');
    `);
    this.addColumnIfMissing('rooms', 'property_id', 'TEXT');
    this.addColumnIfMissing('rooms', 'room_type_id', 'TEXT');
    this.addColumnIfMissing('rooms', 'room_type', 'TEXT');
    this.addColumnIfMissing('rooms', 'zone', 'TEXT');
    this.addColumnIfMissing('rooms', 'sort_key', 'TEXT');
  }

  private bootstrap(options: CreateSqliteLocalSandboxStoreOptions): void {
    if (options.resetOnStart) {
      this.reset(this.seedRooms);
      return;
    }

    if (this.hasBusinessRows()) {
      this.seedCatalogFromRooms(this.listRooms());
      return;
    }

    this.reset(this.seedRooms);
  }

  private addColumnIfMissing(tableName: string, columnName: string, columnType: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
    if (rows.some((row) => row.name === columnName)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }

  private hasBusinessRows(): boolean {
    const row = this.db
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM properties) +
            (SELECT COUNT(*) FROM room_types) +
            (SELECT COUNT(*) FROM rooms) +
            (SELECT COUNT(*) FROM reservations) +
            (SELECT COUNT(*) FROM housekeeping_tasks) +
            (SELECT COUNT(*) FROM maintenance_tickets) +
            (SELECT COUNT(*) FROM audits) +
            (SELECT COUNT(*) FROM domain_events) +
            (SELECT COUNT(*) FROM operation_requests) +
            (SELECT COUNT(*) FROM core_idempotency) +
            (SELECT COUNT(*) FROM api_idempotency) AS total
        `,
      )
      .get() as { total: number };
    return row.total > 0;
  }

  private clearBusinessTables(): void {
    this.db.exec(`
      DELETE FROM api_idempotency;
      DELETE FROM core_idempotency;
      DELETE FROM operation_requests;
      DELETE FROM domain_events;
      DELETE FROM audits;
      DELETE FROM inventory_summary_day_type;
      DELETE FROM inventory_interval_projection;
      DELETE FROM inventory_day_room;
      DELETE FROM inventory_blocks;
      DELETE FROM stays;
      DELETE FROM reservation_room_allocations;
      DELETE FROM reservations;
      DELETE FROM guests;
      DELETE FROM maintenance_tickets;
      DELETE FROM housekeeping_tasks;
      DELETE FROM rooms;
      DELETE FROM room_types;
      DELETE FROM properties;
    `);
    this.inventoryDirty = true;
  }

  private createCorePorts(): CorePorts {
    return {
      rooms: {
        get: (roomId) => cloneValue(this.getRoom(roomId)),
        save: (room) => this.saveRoom(room),
        list: () => cloneValue(this.listRooms()),
      },
      housekeepingTasks: {
        get: (taskId) => cloneValue(this.getHousekeepingTask(taskId)),
        save: (task) => this.saveHousekeepingTask(task),
        list: () => cloneValue(this.listHousekeepingTasks()),
      },
      maintenanceTickets: {
        get: (ticketId) => cloneValue(this.getMaintenanceTicket(ticketId)),
        save: (ticket) => this.saveMaintenanceTicket(ticket),
        list: () => cloneValue(this.listMaintenanceTickets()),
      },
      audits: {
        append: (entry) => this.appendAudit(entry),
        list: () => cloneValue(this.listAudits()),
      },
      idempotency: this.createCoreIdempotencyRepository(),
      events: this.createDomainEventCollector(),
    };
  }

  private createCoreIdempotencyRepository(): IdempotencyRepository<CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult> {
    return {
      get: (idempotencyKey) => cloneValue(this.getCoreIdempotency(idempotencyKey)),
      save: (idempotencyKey, response) => this.saveCoreIdempotency(idempotencyKey, response),
      has: (idempotencyKey) => Boolean(this.getCoreIdempotency(idempotencyKey)),
    };
  }

  private createDomainEventCollector(): DomainEventCollector {
    return {
      append: (event) => this.appendDomainEvent(event),
      list: () => cloneValue(this.listDomainEvents()),
      clear: () => {
        this.db.prepare('DELETE FROM domain_events').run();
      },
    };
  }

  private createApiIdempotencyRepository(): ApiIdempotencyRepository {
    return {
      get: (idempotencyKey) => cloneValue(this.getApiIdempotency(idempotencyKey)),
      save: (record) => this.saveApiIdempotency(record),
      list: () => cloneValue(this.listApiIdempotencyRecords()),
    };
  }

  private createOperationRequestRecord(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse {
    const payloadJson = stableJsonStringify(request.payload ?? {});
    const existing = this.getOperationRequestByClientToken(request.clientToken);

    if (!isSupportedOperationRequestAction(request.action)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_UNSUPPORTED_ACTION',
        `Unsupported operation request action: ${request.action}`,
        'action',
      );
    }

    if (!isOperationRequestSource(request.source)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_UNSUPPORTED_SOURCE',
        `Unsupported operation request source: ${request.source}`,
        'source',
      );
    }

    if (existing && (existing.requestFingerprint !== request.requestFingerprint || existing.payloadJson !== payloadJson)) {
      return operationRequestCreateErrorResponse(
        'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        'The operation request client token was reused with a different request fingerprint or payload.',
        'requestFingerprint',
      );
    }

    if (existing) {
      return {
        ok: true,
        operation: pmsOperationRequestCreateOperation,
        idempotencyStatus: 'replayed',
        request: cloneValue(existing),
      };
    }

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const operationRequest: OperationRequest = {
      operationRequestId: operationRequestIdFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, 'property-unknown'),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      source: request.source,
      action: request.action,
      status: 'queued',
      roomId: optionalString(request.roomId),
      roomNumber: optionalString(request.roomNumber),
      reservationId: optionalString(request.reservationId),
      payloadJson,
      createdAt,
      updatedAt: createdAt,
    };
    this.saveOperationRequest(operationRequest);

    return {
      ok: true,
      operation: pmsOperationRequestCreateOperation,
      idempotencyStatus: 'created',
      request: cloneValue(operationRequest),
    };
  }

  private updateOperationRequestRecord(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse {
    const existing = this.findOperationRequest(request);
    if (!existing) {
      return operationRequestUpdateErrorResponse(
        'OPERATION_REQUEST_NOT_FOUND',
        'Operation request was not found.',
        request.operationRequestId ? 'operationRequestId' : 'clientToken',
      );
    }

    if (request.status !== undefined && !isOperationRequestStatus(request.status)) {
      return operationRequestUpdateErrorResponse(
        'OPERATION_REQUEST_INVALID_STATUS',
        `Unsupported operation request status: ${request.status}`,
        'status',
      );
    }

    const updated: OperationRequest = {
      ...existing,
      status: request.status ?? existing.status,
      resultJson: request.result === undefined ? existing.resultJson : request.result === null ? undefined : stableJsonStringify(request.result),
      updatedAt: nonEmptyString(request.updatedAt, this.now()),
    };
    this.saveOperationRequest(updated);

    return {
      ok: true,
      operation: pmsOperationRequestUpdateOperation,
      request: cloneValue(updated),
    };
  }

  private findOperationRequest(request: OperationRequestGetApiRequest | OperationRequestUpdateApiRequest): OperationRequest | undefined {
    if (request.operationRequestId) {
      return this.getOperationRequestById(request.operationRequestId);
    }
    if (request.clientToken) {
      return this.getOperationRequestByClientToken(request.clientToken);
    }
    return undefined;
  }

  private getRoom(roomId: string): RoomAggregate | undefined {
    const row = this.db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(roomId) as RoomRow | undefined;
    return row ? roomFromRow(row) : undefined;
  }

  private getRoomsByRoomId(roomId: string): RoomAggregate[] {
    return this.getRoom(roomId) ? [this.getRoom(roomId)!] : [];
  }

  private listRooms(): RoomAggregate[] {
    const rows = this.db.prepare('SELECT * FROM rooms ORDER BY room_number, room_id').all() as unknown as RoomRow[];
    return rows.map(roomFromRow);
  }

  private saveRoom(room: RoomAggregate): void {
    const previous = this.getRoom(room.roomId);
    this.ensureCatalogForRoom(room);
    this.db
      .prepare(
        `
          INSERT INTO rooms (room_id, room_number, property_id, room_type_id, room_type, zone, sort_key, occupancy_status, cleaning_status, sale_status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(room_id) DO UPDATE SET
            room_number = excluded.room_number,
            property_id = excluded.property_id,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            zone = excluded.zone,
            sort_key = excluded.sort_key,
            occupancy_status = excluded.occupancy_status,
            cleaning_status = excluded.cleaning_status,
            sale_status = excluded.sale_status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        room.roomId,
        room.roomNumber,
        room.propertyId ?? null,
        room.roomTypeId ?? null,
        room.roomType ?? null,
        room.zone ?? null,
        room.sortKey ?? null,
        room.occupancyStatus,
        room.cleaningStatus,
        room.saleStatus,
        this.now(),
      );
    if (previous && previous.saleStatus !== 'sellable' && room.saleStatus === 'sellable') {
      this.closeActiveStopSellBlocks(room.roomId, this.now());
    }
    this.inventoryDirty = true;
  }

  private seedCatalogFromRooms(rooms: readonly RoomAggregate[]): void {
    for (const room of rooms) {
      this.ensureCatalogForRoom(room);
    }
  }

  private ensureCatalogForRoom(room: RoomAggregate): void {
    const timestamp = this.now();
    const propertyId = room.propertyId ?? 'property-small-hotel';
    const propertyCode = propertyCodeFromPropertyId(propertyId);
    this.db
      .prepare(
        `
          INSERT INTO properties (property_id, property_code, display_name, timezone, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(property_id) DO UPDATE SET
            property_code = excluded.property_code,
            display_name = excluded.display_name,
            timezone = excluded.timezone,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(propertyId, propertyCode, propertyDisplayName(propertyId), propertyTimezone(propertyId), 'active', timestamp, timestamp);

    if (!room.roomTypeId && !room.roomType) {
      return;
    }

    const roomTypeId = room.roomTypeId ?? roomTypeIdFromDisplayName(room.roomType ?? '房型待补全');
    const roomTypeCode = roomTypeCodeFromRoomTypeId(roomTypeId);
    this.db
      .prepare(
        `
          INSERT INTO room_types (room_type_id, property_id, room_type_code, display_name, sort_key, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(room_type_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_type_code = excluded.room_type_code,
            display_name = excluded.display_name,
            sort_key = excluded.sort_key,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        roomTypeId,
        propertyId,
        roomTypeCode,
        room.roomType ?? roomTypeDisplayName(roomTypeId),
        roomTypeCode,
        'active',
        timestamp,
        timestamp,
      );
  }

  private listProperties(): PmsSandboxPropertyReadback[] {
    const rows = this.db
      .prepare('SELECT property_id, property_code, display_name, timezone, status FROM properties ORDER BY property_code, property_id')
      .all() as Array<{ property_id: string; property_code: string; display_name: string; timezone: string; status: string }>;
    return rows.map((row) => ({
      propertyId: row.property_id,
      propertyCode: row.property_code,
      displayName: row.display_name,
      timezone: row.timezone,
      status: row.status,
    }));
  }

  private listRoomTypes(): PmsSandboxRoomTypeReadback[] {
    const rows = this.db
      .prepare('SELECT room_type_id, property_id, room_type_code, display_name, sort_key, status FROM room_types ORDER BY sort_key, room_type_code')
      .all() as Array<{ room_type_id: string; property_id: string; room_type_code: string; display_name: string; sort_key: string; status: string }>;
    return rows.map((row) => ({
      roomTypeId: row.room_type_id,
      propertyId: row.property_id,
      roomTypeCode: row.room_type_code,
      displayName: row.display_name,
      sortKey: row.sort_key,
      status: row.status,
    }));
  }

  getReservation(reservationCode: string, requestedAt: string): ReservationReadModel | undefined {
    const row = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode) as ReservationRow | undefined;
    return row ? this.reservationReadModelFromRow(row, requestedAt) : undefined;
  }

  todayArrivals(businessDate: string, requestedAt: string): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations()
        .filter((reservation) => reservation.status !== 'cancelled' && sameBusinessDate(reservation.arrivalDate, businessDate)),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  todayDepartures(businessDate: string, requestedAt: string): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations()
        .filter((reservation) => reservation.status !== 'cancelled' && sameBusinessDate(reservation.departureDate, businessDate)),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  roomReservationContext(roomId: string, requestedAt: string): RoomReservationContextReadModel {
    const room = this.getRoom(roomId);
    const reservations = this.listReservationsByRoomIds(new Set([roomId]));
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      roomId,
      ...(room?.roomNumber ? { roomNumber: room.roomNumber } : {}),
      ...(room?.roomType ? { roomType: room.roomType } : {}),
      reservations,
      projectionFreshness: createProjectionFreshness(requestedAt, room ? 'fresh' : 'unavailable'),
    };
  }

  private listReservations(): ReservationReadModel[] {
    const rows = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          ORDER BY r.arrival_date, r.reservation_code
        `,
      )
      .all() as unknown as ReservationRow[];
    return rows.map((row) => this.reservationReadModelFromRow(row, this.now()));
  }

  private listReservationsByRoomIds(roomIds: ReadonlySet<string>): ReservationReadModel[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservations().filter((reservation) => {
      if (reservation.roomId && roomIds.has(reservation.roomId)) {
        return true;
      }
      const allocation = this.getLatestReservationAllocation(reservation.reservationId);
      return Boolean(allocation?.roomId && roomIds.has(allocation.roomId));
    });
  }

  private listReservationAllocations(): PmsSandboxReservationAllocationReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          ORDER BY start_date, allocation_id
        `,
      )
      .all() as Array<{
        allocation_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        room_type_id?: string | null;
        room_type?: string | null;
        start_date: string;
        end_date: string;
        status: string;
      }>;
    return rows.map((row) => ({
      allocationId: row.allocation_id,
      reservationId: row.reservation_id,
      ...(row.room_id ? { roomId: row.room_id } : {}),
      ...(row.room_number ? { roomNumber: row.room_number } : {}),
      ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
      ...(row.room_type ? { roomType: row.room_type } : {}),
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    }));
  }

  private listReservationAllocationsByRoomIds(roomIds: ReadonlySet<string>): PmsSandboxReservationAllocationReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservationAllocations().filter((allocation) => allocation.roomId && roomIds.has(allocation.roomId));
  }

  private listStays(): PmsSandboxStayReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          ORDER BY s.created_at, s.stay_id
        `,
      )
      .all() as unknown as StayRow[];
    return rows.map(stayFromRow);
  }

  private listStaysByRoomIds(roomIds: ReadonlySet<string>): PmsSandboxStayReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listStays().filter((stay) => stay.roomId && roomIds.has(stay.roomId));
  }

  private saveReservationImportRecord(record: PmsSandboxReservationImportRecord): ReservationReadModel {
    const guestId = `guest-${record.reservationId}`;
    const createdAt = this.now();
    const room = record.roomId ? this.getRoom(record.roomId) : undefined;
    const propertyId = record.propertyId || room?.propertyId || 'property-small-hotel';
    const roomTypeId = record.roomTypeId ?? room?.roomTypeId;
    const roomType = record.roomType ?? room?.roomType;
    this.ensureCatalogForRoom({
      roomId: record.roomId ?? `room-import-${record.reservationCode}`,
      roomNumber: record.roomNumber ?? room?.roomNumber ?? record.reservationCode,
      propertyId,
      roomTypeId,
      roomType,
      zone: room?.zone,
      sortKey: room?.sortKey,
      occupancyStatus: room?.occupancyStatus ?? 'vacant',
      cleaningStatus: room?.cleaningStatus ?? 'clean',
      saleStatus: room?.saleStatus ?? 'sellable',
    });
    this.db
      .prepare(
        `
          INSERT INTO guests (guest_id, display_name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guest_id) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at
        `,
      )
      .run(guestId, record.guestDisplayName, createdAt, createdAt);
    this.db
      .prepare(
        `
          INSERT INTO reservations (
            reservation_id, reservation_code, property_id, guest_id, room_id, room_number,
            room_type_id, room_type, arrival_date, departure_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reservation_id) DO UPDATE SET
            reservation_code = excluded.reservation_code,
            property_id = excluded.property_id,
            guest_id = excluded.guest_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            arrival_date = excluded.arrival_date,
            departure_date = excluded.departure_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.reservationId,
        record.reservationCode,
        propertyId,
        guestId,
        record.roomId ?? null,
        record.roomNumber ?? null,
        roomTypeId ?? null,
        roomType ?? null,
        record.arrivalDate,
        record.departureDate,
        record.status,
        createdAt,
        createdAt,
      );
    this.inventoryDirty = true;

    if (record.allocation || record.roomId || record.roomNumber) {
      const allocation = {
        allocationId: record.allocation?.allocationId ?? `alloc-${record.reservationId}`,
        roomId: record.allocation?.roomId ?? record.roomId ?? room?.roomId,
        roomNumber: record.allocation?.roomNumber ?? record.roomNumber ?? room?.roomNumber,
        roomTypeId: record.allocation?.roomTypeId ?? roomTypeId,
        roomType: record.allocation?.roomType ?? roomType,
        startDate: record.allocation?.startDate ?? record.arrivalDate,
        endDate: record.allocation?.endDate ?? record.departureDate,
        status: record.allocation?.status ?? 'allocated',
      };
      this.saveReservationAllocation(record.reservationId, allocation, createdAt);
    }

    if (record.stay) {
      this.saveStay(record.reservationId, {
        stayId: record.stay.stayId ?? stayIdForReservationRoom(record.reservationId, record.stay.roomId ?? record.roomId ?? room?.roomId ?? 'unknown'),
        roomId: record.stay.roomId ?? record.roomId ?? room?.roomId,
        roomNumber: record.stay.roomNumber ?? record.roomNumber ?? room?.roomNumber,
        checkedInAt: record.stay.checkedInAt,
        checkedOutAt: record.stay.checkedOutAt,
        status: record.stay.status ?? (record.stay.checkedOutAt ? 'checkedOut' : 'inHouse'),
      }, createdAt);
    }

    const row = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
    )
      .get(record.reservationId) as unknown as ReservationRow;
    return this.reservationReadModelFromRow(row, createdAt);
  }

  private saveReservationAllocation(
    reservationId: string,
    allocation: {
      allocationId: string;
      roomId?: string;
      roomNumber?: string;
      roomTypeId?: string;
      roomType?: string;
      startDate: string;
      endDate: string;
      status: string;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_room_allocations (
            allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(allocation_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        allocation.allocationId,
        reservationId,
        allocation.roomId ?? null,
        allocation.roomNumber ?? null,
        allocation.roomTypeId ?? null,
        allocation.roomType ?? null,
        allocation.startDate,
        allocation.endDate,
        allocation.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  private saveStay(
    reservationId: string,
    stay: {
      stayId: string;
      roomId?: string;
      roomNumber?: string;
      checkedInAt?: string;
      checkedOutAt?: string;
      status: StayStatus;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO stays (stay_id, reservation_id, room_id, room_number, checked_in_at, checked_out_at, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stay_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            checked_in_at = excluded.checked_in_at,
            checked_out_at = excluded.checked_out_at,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        stay.stayId,
        reservationId,
        stay.roomId ?? null,
        stay.roomNumber ?? null,
        stay.checkedInAt ?? null,
        stay.checkedOutAt ?? null,
        stay.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  private recordCheckInStayFromConfirm(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined {
    const reservation = this.resolveStayReservation(request.reservationId, request.reservationCode);
    if (!reservation) {
      return undefined;
    }
    const active = this.findLatestStay({ reservationId: reservation.reservation_id, roomId: result.roomId, status: 'inHouse' });
    if (active) {
      return active;
    }
    const timestamp = nonEmptyString(result.auditEntry.occurredAt, request.requestedAt);
    const stayId = stayIdForCheckIn(reservation.reservation_id, result.roomId, request.idempotencyKey);
    this.saveStay(reservation.reservation_id, {
      stayId,
      roomId: result.roomId,
      roomNumber: result.roomNumber,
      checkedInAt: timestamp,
      status: 'inHouse',
    }, timestamp);
    return this.findLatestStay({ reservationId: reservation.reservation_id, roomId: result.roomId, status: 'inHouse' });
  }

  private recordCheckOutStayFromConfirm(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined {
    const hasReservationIdentity = Boolean(optionalString(request.reservationId) || optionalString(request.reservationCode));
    const reservation = this.resolveStayReservation(request.reservationId, request.reservationCode);
    if (hasReservationIdentity && !reservation) {
      return undefined;
    }
    const active = this.findLatestStay({ reservationId: reservation?.reservation_id, roomId: result.roomId, status: 'inHouse' });
    if (!active) {
      return this.findLatestStay({ reservationId: reservation?.reservation_id, roomId: result.roomId, status: 'checkedOut' });
    }
    const timestamp = nonEmptyString(result.auditEntry.occurredAt, request.requestedAt);
    this.saveStay(active.reservationId, {
      stayId: active.stayId,
      roomId: active.roomId ?? result.roomId,
      roomNumber: active.roomNumber ?? result.roomNumber,
      checkedInAt: active.checkedInAt,
      checkedOutAt: timestamp,
      status: 'checkedOut',
    }, timestamp);
    return this.findLatestStay({ reservationId: active.reservationId, roomId: result.roomId, status: 'checkedOut' });
  }

  private resolveStayReservation(reservationId?: string, reservationCode?: string): ReservationRow | undefined {
    const normalizedId = optionalString(reservationId);
    if (normalizedId) {
      const byId = this.getReservationRowById(normalizedId);
      if (byId) return byId;
    }
    const normalizedCode = optionalString(reservationCode);
    return normalizedCode ? this.getReservationRowByCode(normalizedCode) : undefined;
  }

  private getReservationRowById(reservationId: string): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
      )
      .get(reservationId) as ReservationRow | undefined;
  }

  private getReservationRowByCode(reservationCode: string): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode) as ReservationRow | undefined;
  }

  private findLatestStay(filter: { readonly reservationId?: string; readonly roomId?: string; readonly status: StayStatus }): PmsSandboxStayReadback | undefined {
    return this.listStays()
      .filter((stay) => stay.status === filter.status)
      .filter((stay) => !filter.reservationId || stay.reservationId === filter.reservationId)
      .filter((stay) => !filter.roomId || stay.roomId === filter.roomId)
      .at(-1);
  }

  private getLatestReservationAllocation(reservationId: string): PmsSandboxReservationAllocationReadback | undefined {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          WHERE reservation_id = ?
          ORDER BY updated_at DESC, allocation_id DESC
        `,
      )
      .all(reservationId) as Array<{
        allocation_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        room_type_id?: string | null;
        room_type?: string | null;
        start_date: string;
        end_date: string;
        status: string;
      }>;
    const row = rows[0];
    return row
      ? {
          allocationId: row.allocation_id,
          reservationId: row.reservation_id,
          ...(row.room_id ? { roomId: row.room_id } : {}),
          ...(row.room_number ? { roomNumber: row.room_number } : {}),
          ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
          ...(row.room_type ? { roomType: row.room_type } : {}),
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.status,
        }
      : undefined;
  }

  private getLatestStay(reservationId: string): PmsSandboxStayReadback | undefined {
    const row = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          WHERE s.reservation_id = ?
          ORDER BY s.updated_at DESC, s.stay_id DESC
        `,
      )
      .get(reservationId) as StayRow | undefined;
    return row ? stayFromRow(row) : undefined;
  }

  private reservationReadModelFromRow(row: ReservationRow, generatedAt: string): ReservationReadModel {
    const allocation = this.getLatestReservationAllocation(row.reservation_id);
    const stay = this.getLatestStay(row.reservation_id);
    return {
      reservationId: row.reservation_id,
      reservationCode: row.reservation_code,
      propertyId: row.property_id,
      ...(stay?.roomId ? { roomId: stay.roomId } : allocation?.roomId ? { roomId: allocation.roomId } : row.room_id ? { roomId: row.room_id } : {}),
      ...(stay?.roomNumber ? { roomNumber: stay.roomNumber } : allocation?.roomNumber ? { roomNumber: allocation.roomNumber } : row.room_number ? { roomNumber: row.room_number } : {}),
      ...(allocation?.roomTypeId ? { roomTypeId: allocation.roomTypeId } : row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
      ...(allocation?.roomType ? { roomType: allocation.roomType } : row.room_type ? { roomType: row.room_type } : {}),
      guestDisplayName: row.display_name,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: stay?.status === 'inHouse'
        ? 'checkedIn'
        : stay?.status === 'checkedOut'
          ? 'checkedOut'
          : row.status,
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }

  private rebuildInventoryHorizon(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    const generatedAt = this.now();
    const startDate = normalizeBusinessDate(options.startDate ?? generatedAt);
    const horizonDays = normalizeInventoryHorizonDays(options.horizonDays);
    const endDate = addBusinessDays(startDate, horizonDays);
    const rooms = this.listRooms();
    const reservations = this.listReservations();
    const reservationsById = new Map(reservations.map((reservation) => [reservation.reservationId, reservation]));
    const allocations = this.listReservationAllocations();
    const stays = this.listStays();
    const allBlocks = this.listInventoryBlocks();

    this.clearInventoryDerivedTables(startDate, endDate);

    const dayRooms: InventoryDayRoom[] = [];
    for (const businessDate of businessDateRange(startDate, endDate)) {
      for (const room of rooms) {
        const dayRoom = this.deriveInventoryDayRoom({
          businessDate,
          endDate,
          room,
          blocks: allBlocks,
          reservationsById,
          allocations,
          stays,
          updatedAt: generatedAt,
        });
        this.saveInventoryDayRoom(dayRoom);
        dayRooms.push(dayRoom);
      }
    }

    for (const interval of compressInventoryIntervals(dayRooms, generatedAt)) {
      this.saveInventoryIntervalProjection(interval);
    }
    for (const summary of summarizeInventoryDayRooms(dayRooms, generatedAt)) {
      this.saveInventorySummaryDayType(summary);
    }

    this.inventoryDirty = false;
    const filteredDayRooms = this.listInventoryDayRooms(startDate, endDate, options.roomId);
    const summaryRoomTypeIds = options.roomId ? new Set(filteredDayRooms.map((row) => row.roomTypeId ?? 'room-type-unknown')) : undefined;
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt,
      startDate,
      endDate,
      horizonDays,
      summaryStatus: 'fresh',
      blocks: this.listInventoryBlocks(options.roomId),
      dayRooms: filteredDayRooms,
      intervals: this.listInventoryIntervalProjection(startDate, endDate, options.roomId),
      summaries: this.listInventorySummaryDayType(startDate, endDate, summaryRoomTypeIds),
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }

  private deriveInventoryDayRoom(input: {
    readonly businessDate: string;
    readonly endDate: string;
    readonly room: RoomAggregate;
    readonly blocks: readonly InventoryBlock[];
    readonly reservationsById: ReadonlyMap<string, ReservationReadModel>;
    readonly allocations: readonly PmsSandboxReservationAllocationReadback[];
    readonly stays: readonly PmsSandboxStayReadback[];
    readonly updatedAt: string;
  }): InventoryDayRoom {
    const activeBlock = input.blocks.find((block) => block.roomId === input.room.roomId && block.status === 'active' && dateInRange(input.businessDate, block.startDate, block.endDate ?? input.endDate));
    const occupiedStay = findOccupiedStayForRoomDate(input.stays, input.reservationsById, input.room.roomId, input.businessDate);
    const reservedAllocation = findReservedAllocationForRoomDate(input.allocations, input.reservationsById, input.room.roomId, input.businessDate);
    const reservedReservation = reservedAllocation ? undefined : findReservedReservationForRoomDate(input.reservationsById, input.room.roomId, input.businessDate);
    const propertyId = input.room.propertyId ?? 'property-small-hotel';

    if (activeBlock) {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'blocked', [{ sourceType: 'inventory_block', sourceId: activeBlock.blockId, label: activeBlock.reason }], input.updatedAt);
    }
    if (input.room.saleStatus !== 'sellable') {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'blocked', [{ sourceType: 'room_status', sourceId: input.room.roomId, label: input.room.saleStatus }], input.updatedAt);
    }
    if (occupiedStay) {
      const reservation = input.reservationsById.get(occupiedStay.reservationId);
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'occupied', [{ sourceType: 'stay', sourceId: occupiedStay.stayId, label: reservation?.reservationCode }], input.updatedAt);
    }
    if (reservedAllocation) {
      const reservation = input.reservationsById.get(reservedAllocation.reservationId);
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'reserved', [{ sourceType: 'reservation', sourceId: reservedAllocation.reservationId, label: reservation?.reservationCode }], input.updatedAt);
    }
    if (reservedReservation) {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'reserved', [{ sourceType: 'reservation', sourceId: reservedReservation.reservationId, label: reservedReservation.reservationCode }], input.updatedAt);
    }
    return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'available', [], input.updatedAt);
  }

  private clearInventoryDerivedTables(startDate: string, endDate: string): void {
    this.db.prepare('DELETE FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ?').run(startDate, endDate);
    this.db.prepare('DELETE FROM inventory_interval_projection WHERE start_date < ? AND end_date > ?').run(endDate, startDate);
    this.db.prepare('DELETE FROM inventory_day_room WHERE business_date >= ? AND business_date < ?').run(startDate, endDate);
  }

  private listInventoryBlocks(roomId?: string): InventoryBlock[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_blocks WHERE room_id = ? ORDER BY start_date, block_id').all(roomId) as unknown as InventoryBlockRow[]
      : this.db.prepare('SELECT * FROM inventory_blocks ORDER BY start_date, block_id').all() as unknown as InventoryBlockRow[];
    return rows.map(inventoryBlockFromRow);
  }

  private getInventoryBlockBySource(sourceType: InventoryBlock['sourceType'], sourceId: string, roomId: string, blockType: InventoryBlock['blockType']): InventoryBlock | undefined {
    const row = this.db
      .prepare('SELECT * FROM inventory_blocks WHERE source_type = ? AND source_id = ? AND room_id = ? AND block_type = ?')
      .get(sourceType, sourceId, roomId, blockType) as InventoryBlockRow | undefined;
    return row ? inventoryBlockFromRow(row) : undefined;
  }

  private upsertInventoryBlock(block: InventoryBlock): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_blocks (
            block_id, property_id, room_id, room_type_id, block_type, start_date, end_date, status,
            source_type, source_id, reason, created_at, updated_at, closed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_type, source_id, room_id, block_type) DO UPDATE SET
            property_id = excluded.property_id,
            room_type_id = excluded.room_type_id,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            reason = excluded.reason,
            updated_at = excluded.updated_at,
            closed_at = excluded.closed_at
        `,
      )
      .run(
        block.blockId,
        block.propertyId,
        block.roomId,
        block.roomTypeId ?? null,
        block.blockType,
        block.startDate,
        block.endDate ?? null,
        block.status,
        block.sourceType,
        block.sourceId,
        block.reason,
        block.createdAt,
        block.updatedAt,
        block.closedAt ?? null,
      );
    this.inventoryDirty = true;
  }

  private upsertMaintenanceInventoryBlock(ticket: MaintenanceTicket): void {
    if (!ticket.stopSellRequested) {
      return;
    }
    const existing = this.getInventoryBlockBySource('maintenance_ticket', ticket.ticketId, ticket.roomId, 'repair');
    if (existing?.status === 'closed') {
      return;
    }
    const room = this.getRoom(ticket.roomId);
    const timestamp = this.now();
    this.upsertInventoryBlock({
      blockId: existing?.blockId ?? `block-${ticket.ticketId}`,
      propertyId: room?.propertyId ?? 'property-small-hotel',
      roomId: ticket.roomId,
      ...(room?.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
      blockType: 'repair',
      startDate: normalizeBusinessDate(ticket.createdAt),
      status: 'active',
      sourceType: 'maintenance_ticket',
      sourceId: ticket.ticketId,
      reason: ticket.reason,
      createdAt: existing?.createdAt ?? ticket.createdAt,
      updatedAt: timestamp,
    });
  }

  private closeActiveStopSellBlocks(roomId: string, timestamp: string): void {
    const closeDate = normalizeBusinessDate(timestamp);
    const result = this.db
      .prepare(
        `
          UPDATE inventory_blocks
          SET status = 'closed', end_date = ?, closed_at = ?, updated_at = ?
          WHERE room_id = ? AND status = 'active' AND block_type = 'repair' AND source_type = 'maintenance_ticket'
        `,
      )
      .run(closeDate, timestamp, timestamp, roomId);
    if (result.changes > 0) {
      this.inventoryDirty = true;
    }
  }

  private saveInventoryDayRoom(row: InventoryDayRoom): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_day_room (
            business_date, property_id, room_id, room_number, room_type_id, room_type, availability_status, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, room_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            availability_status = excluded.availability_status,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(row.businessDate, row.propertyId, row.roomId, row.roomNumber, row.roomTypeId ?? null, row.roomType ?? null, row.availabilityStatus, JSON.stringify(row.sourceRefs), row.updatedAt);
  }

  private listInventoryDayRooms(startDate: string, endDate: string, roomId?: string): InventoryDayRoom[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? AND room_id = ? ORDER BY business_date, room_id').all(startDate, endDate, roomId) as unknown as InventoryDayRoomRow[]
      : this.db.prepare('SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_id').all(startDate, endDate) as unknown as InventoryDayRoomRow[];
    return rows.map(inventoryDayRoomFromRow);
  }

  private saveInventoryIntervalProjection(interval: InventoryIntervalProjection): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_interval_projection (
            projection_id, property_id, room_id, room_number, room_type_id, room_type, start_date, end_date,
            calendar_kind, sellable_status, title, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(projection_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            calendar_kind = excluded.calendar_kind,
            sellable_status = excluded.sellable_status,
            title = excluded.title,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        interval.projectionId,
        interval.propertyId,
        interval.roomId,
        interval.roomNumber,
        interval.roomTypeId ?? null,
        interval.roomType ?? null,
        interval.startDate,
        interval.endDate,
        interval.calendarKind,
        interval.sellableStatus,
        interval.title,
        JSON.stringify(interval.sourceRefs),
        interval.updatedAt,
      );
  }

  private listInventoryIntervalProjection(startDate: string, endDate: string, roomId?: string): InventoryIntervalProjection[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? AND room_id = ? ORDER BY start_date, room_id, projection_id').all(endDate, startDate, roomId) as unknown as InventoryIntervalProjectionRow[]
      : this.db.prepare('SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? ORDER BY start_date, room_id, projection_id').all(endDate, startDate) as unknown as InventoryIntervalProjectionRow[];
    return rows.map(inventoryIntervalProjectionFromRow);
  }

  private saveInventorySummaryDayType(summary: InventorySummaryDayType): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_summary_day_type (
            business_date, property_id, room_type_id, room_type, total_rooms, available_rooms, occupied_rooms, blocked_rooms, reserved_rooms, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, property_id, room_type_id) DO UPDATE SET
            room_type = excluded.room_type,
            total_rooms = excluded.total_rooms,
            available_rooms = excluded.available_rooms,
            occupied_rooms = excluded.occupied_rooms,
            blocked_rooms = excluded.blocked_rooms,
            reserved_rooms = excluded.reserved_rooms,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        summary.businessDate,
        summary.propertyId,
        summary.roomTypeId,
        summary.roomType ?? null,
        summary.totalRooms,
        summary.availableRooms,
        summary.occupiedRooms,
        summary.blockedRooms,
        summary.reservedRooms,
        summary.updatedAt,
      );
  }

  private listInventorySummaryDayType(startDate: string, endDate: string, roomTypeIds?: ReadonlySet<string>): InventorySummaryDayType[] {
    const rows = this.db
      .prepare('SELECT * FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_type_id')
      .all(startDate, endDate) as unknown as InventorySummaryDayTypeRow[];
    return rows.map(inventorySummaryDayTypeFromRow).filter((row) => !roomTypeIds || roomTypeIds.has(row.roomTypeId));
  }

  private getHousekeepingTask(taskId: string): HousekeepingTask | undefined {
    const row = this.db.prepare('SELECT payload_json FROM housekeeping_tasks WHERE task_id = ?').get(taskId) as JsonPayloadRow | undefined;
    return row ? parseJson<HousekeepingTask>(row.payload_json) : undefined;
  }

  private listHousekeepingTasks(): HousekeepingTask[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM housekeeping_tasks ORDER BY created_at, task_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<HousekeepingTask>(row.payload_json));
  }

  private listHousekeepingTasksByRoomIds(roomIds: ReadonlySet<string>): HousekeepingTask[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listHousekeepingTasks().filter((task) => roomIds.has(task.roomId));
  }

  private saveHousekeepingTask(task: HousekeepingTask): void {
    this.db
      .prepare(
        `
          INSERT INTO housekeeping_tasks (task_id, room_id, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            room_id = excluded.room_id,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(task.taskId, task.roomId, JSON.stringify(task), task.createdAt, this.now());
  }

  private getMaintenanceTicket(ticketId: string): MaintenanceTicket | undefined {
    const row = this.db.prepare('SELECT payload_json FROM maintenance_tickets WHERE ticket_id = ?').get(ticketId) as JsonPayloadRow | undefined;
    return row ? parseJson<MaintenanceTicket>(row.payload_json) : undefined;
  }

  private listMaintenanceTickets(): MaintenanceTicket[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM maintenance_tickets ORDER BY created_at, ticket_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<MaintenanceTicket>(row.payload_json));
  }

  private listMaintenanceTicketsByRoomIds(roomIds: ReadonlySet<string>): MaintenanceTicket[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listMaintenanceTickets().filter((ticket) => roomIds.has(ticket.roomId));
  }

  private saveMaintenanceTicket(ticket: MaintenanceTicket): void {
    this.db
      .prepare(
        `
          INSERT INTO maintenance_tickets (ticket_id, room_id, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ticket_id) DO UPDATE SET
            room_id = excluded.room_id,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(ticket.ticketId, ticket.roomId, JSON.stringify(ticket), ticket.createdAt, this.now());
    this.upsertMaintenanceInventoryBlock(ticket);
    this.inventoryDirty = true;
  }

  private getOperationRequestById(operationRequestId: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE operation_request_id = ?').get(operationRequestId) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  private getOperationRequestByClientToken(clientToken: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE client_token = ?').get(clientToken) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  private listOperationRequestRecords(): OperationRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM operation_requests ORDER BY created_at, operation_request_id')
      .all() as unknown as OperationRequestRow[];
    return rows.map(operationRequestFromRow);
  }

  private listOperationRequestsByRoomIds(roomIds: ReadonlySet<string>): OperationRequest[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listOperationRequestRecords().filter((request) => request.roomId ? roomIds.has(request.roomId) : false);
  }

  private saveOperationRequest(request: OperationRequest): void {
    this.db
      .prepare(
        `
          INSERT INTO operation_requests (
            operation_request_id, property_id, client_token, request_fingerprint, source, action, status,
            room_id, room_number, reservation_id, payload_json, result_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(operation_request_id) DO UPDATE SET
            property_id = excluded.property_id,
            client_token = excluded.client_token,
            request_fingerprint = excluded.request_fingerprint,
            source = excluded.source,
            action = excluded.action,
            status = excluded.status,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            reservation_id = excluded.reservation_id,
            payload_json = excluded.payload_json,
            result_json = excluded.result_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        request.operationRequestId,
        request.propertyId,
        request.clientToken,
        request.requestFingerprint,
        request.source,
        request.action,
        request.status,
        request.roomId ?? null,
        request.roomNumber ?? null,
        request.reservationId ?? null,
        request.payloadJson,
        request.resultJson ?? null,
        request.createdAt,
        request.updatedAt,
      );
  }

  private appendAudit(entry: AuditEntry): void {
    this.db
      .prepare(
        `
          INSERT INTO audits (audit_id, room_id, command_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(entry.auditId, entry.roomId, entry.commandType, entry.correlationId, entry.idempotencyKey, entry.occurredAt, JSON.stringify(entry));
  }

  private listAudits(): AuditEntry[] {
    const rows = this.db.prepare('SELECT payload_json FROM audits ORDER BY occurred_at, audit_id').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<AuditEntry>(row.payload_json));
  }

  private listAuditsByRoomIds(roomIds: ReadonlySet<string>): AuditEntry[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listAudits().filter((entry) => roomIds.has(entry.roomId));
  }

  private appendDomainEvent(event: DomainEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO domain_events (event_id, room_id, event_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(event.eventId, roomIdFromEvent(event) ?? null, event.type, event.correlationId, event.idempotencyKey, event.occurredAt, JSON.stringify(event));
  }

  private listDomainEvents(): DomainEvent[] {
    const rows = this.db.prepare('SELECT payload_json FROM domain_events ORDER BY sequence').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<DomainEvent>(row.payload_json));
  }

  private listDomainEventsByRoomIds(roomIds: ReadonlySet<string>): DomainEvent[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listDomainEvents().filter((event) => {
      const roomId = roomIdFromEvent(event);
      return roomId ? roomIds.has(roomId) : false;
    });
  }

  private getCoreIdempotency(idempotencyKey: string): CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult | undefined {
    const row = this.db.prepare('SELECT response_json FROM core_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | { response_json: string }
      | undefined;
    return row ? parseJson<CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult>(row.response_json) : undefined;
  }

  private saveCoreIdempotency(idempotencyKey: string, response: CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult): void {
    const timestamp = this.now();
    this.db
      .prepare(
        `
          INSERT INTO core_idempotency (idempotency_key, response_json, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET
            response_json = excluded.response_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(idempotencyKey, JSON.stringify(response), timestamp, timestamp);
  }

  private getApiIdempotency(idempotencyKey: string): ApiIdempotencyRecord | undefined {
    const row = this.db.prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | ApiIdempotencyRow
      | undefined;
    return row ? apiIdempotencyFromRow(row) : undefined;
  }

  private listApiIdempotencyRecords(): ApiIdempotencyRecord[] {
    const rows = this.db
      .prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency ORDER BY created_at, idempotency_key')
      .all() as unknown as ApiIdempotencyRow[];
    return rows.map(apiIdempotencyFromRow);
  }

  private saveApiIdempotency(record: ApiIdempotencyRecord): void {
    const timestamp = this.now();
    this.db
      .prepare(
        `
          INSERT INTO api_idempotency (idempotency_key, operation, mode, request_fingerprint, request_json, response_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET
            operation = excluded.operation,
            mode = excluded.mode,
            request_fingerprint = excluded.request_fingerprint,
            request_json = excluded.request_json,
            response_json = excluded.response_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.idempotencyKey,
        requestOperationFromRecord(record),
        requestModeFromRecord(record),
        record.requestFingerprint,
        JSON.stringify(requestJsonFromRecord(record)),
        JSON.stringify(record.response),
        timestamp,
        timestamp,
      );
  }
}

export function createSqliteLocalSandboxStore(options: CreateSqliteLocalSandboxStoreOptions): SqliteLocalSandboxStore {
  return new SqliteLocalSandboxStore(options);
}

interface RoomRow {
  readonly room_id: string;
  readonly room_number: string;
  readonly property_id?: string | null;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly zone?: string | null;
  readonly sort_key?: string | null;
  readonly occupancy_status: RoomAggregate['occupancyStatus'];
  readonly cleaning_status: RoomAggregate['cleaningStatus'];
  readonly sale_status: RoomAggregate['saleStatus'];
}

interface JsonPayloadRow {
  readonly payload_json: string;
}

interface ApiIdempotencyRow {
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly response_json: string;
}

interface OperationRequestRow {
  readonly operation_request_id: string;
  readonly property_id: string;
  readonly client_token: string;
  readonly request_fingerprint: string;
  readonly source: OperationRequest['source'];
  readonly action: OperationRequest['action'];
  readonly status: OperationRequest['status'];
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly reservation_id?: string | null;
  readonly payload_json: string;
  readonly result_json?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ReservationRow {
  readonly reservation_id: string;
  readonly reservation_code: string;
  readonly property_id: string;
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly display_name: string;
  readonly arrival_date: string;
  readonly departure_date: string;
  readonly status: ReservationReadModel['status'];
}

interface StayRow {
  readonly stay_id: string;
  readonly reservation_id: string;
  readonly reservation_code?: string | null;
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly checked_in_at?: string | null;
  readonly checked_out_at?: string | null;
  readonly status: string;
}

interface InventoryBlockRow {
  readonly block_id: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_type_id?: string | null;
  readonly block_type: InventoryBlock['blockType'];
  readonly start_date: string;
  readonly end_date?: string | null;
  readonly status: InventoryBlock['status'];
  readonly source_type: InventoryBlock['sourceType'];
  readonly source_id: string;
  readonly reason: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at?: string | null;
}

interface InventoryDayRoomRow {
  readonly business_date: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_number: string;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly availability_status: InventoryAvailabilityStatus;
  readonly source_refs_json: string;
  readonly updated_at: string;
}

interface InventoryIntervalProjectionRow {
  readonly projection_id: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_number: string;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly start_date: string;
  readonly end_date: string;
  readonly calendar_kind: InventoryCalendarKind;
  readonly sellable_status: InventorySellableStatus;
  readonly title: string;
  readonly source_refs_json: string;
  readonly updated_at: string;
}

interface InventorySummaryDayTypeRow {
  readonly business_date: string;
  readonly property_id: string;
  readonly room_type_id: string;
  readonly room_type?: string | null;
  readonly total_rooms: number;
  readonly available_rooms: number;
  readonly occupied_rooms: number;
  readonly blocked_rooms: number;
  readonly reserved_rooms: number;
  readonly updated_at: string;
}

function roomFromRow(row: RoomRow): RoomAggregate {
  return {
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    ...(row.zone ? { zone: row.zone } : {}),
    ...(row.sort_key ? { sortKey: row.sort_key } : {}),
    occupancyStatus: row.occupancy_status,
    cleaningStatus: row.cleaning_status,
    saleStatus: row.sale_status,
  };
}

function inventoryBlockFromRow(row: InventoryBlockRow): InventoryBlock {
  return {
    blockId: row.block_id,
    propertyId: row.property_id,
    roomId: row.room_id,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    blockType: row.block_type,
    startDate: row.start_date,
    ...(row.end_date ? { endDate: row.end_date } : {}),
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
  };
}

function inventoryDayRoomFromRow(row: InventoryDayRoomRow): InventoryDayRoom {
  return {
    businessDate: row.business_date,
    propertyId: row.property_id,
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    availabilityStatus: row.availability_status,
    sourceRefs: parseJson<InventorySourceRef[]>(row.source_refs_json),
    updatedAt: row.updated_at,
  };
}

function inventoryIntervalProjectionFromRow(row: InventoryIntervalProjectionRow): InventoryIntervalProjection {
  return {
    projectionId: row.projection_id,
    propertyId: row.property_id,
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    startDate: row.start_date,
    endDate: row.end_date,
    calendarKind: row.calendar_kind,
    sellableStatus: row.sellable_status,
    title: row.title,
    sourceRefs: parseJson<InventorySourceRef[]>(row.source_refs_json),
    updatedAt: row.updated_at,
  };
}

function inventorySummaryDayTypeFromRow(row: InventorySummaryDayTypeRow): InventorySummaryDayType {
  return {
    businessDate: row.business_date,
    propertyId: row.property_id,
    roomTypeId: row.room_type_id,
    ...(row.room_type ? { roomType: row.room_type } : {}),
    totalRooms: row.total_rooms,
    availableRooms: row.available_rooms,
    occupiedRooms: row.occupied_rooms,
    blockedRooms: row.blocked_rooms,
    reservedRooms: row.reserved_rooms,
    updatedAt: row.updated_at,
  };
}

function apiIdempotencyFromRow(row: ApiIdempotencyRow): ApiIdempotencyRecord {
  return {
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    response: parseJson<ApiIdempotencyRecord['response']>(row.response_json),
  };
}

function operationRequestFromRow(row: OperationRequestRow): OperationRequest {
  return {
    operationRequestId: row.operation_request_id,
    propertyId: row.property_id,
    clientToken: row.client_token,
    requestFingerprint: row.request_fingerprint,
    source: row.source,
    action: row.action,
    status: row.status,
    ...(row.room_id ? { roomId: row.room_id } : {}),
    ...(row.room_number ? { roomNumber: row.room_number } : {}),
    ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
    payloadJson: row.payload_json,
    ...(row.result_json ? { resultJson: row.result_json } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stayFromRow(row: StayRow): PmsSandboxStayReadback {
  return {
    stayId: row.stay_id,
    reservationId: row.reservation_id,
    ...(row.reservation_code ? { reservationCode: row.reservation_code } : {}),
    ...(row.room_id ? { roomId: row.room_id } : {}),
    ...(row.room_number ? { roomNumber: row.room_number } : {}),
    ...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
    ...(row.checked_out_at ? { checkedOutAt: row.checked_out_at } : {}),
    status: normalizeStayStatus(row.status),
  };
}

function normalizeStayStatus(value: string): StayStatus {
  return value === 'checkedOut' ? 'checkedOut' : 'inHouse';
}

function operationRequestCreateErrorResponse(code: ApiErrorCode, message: string, field: string): OperationRequestCreateApiResponse {
  return {
    ok: false,
    operation: pmsOperationRequestCreateOperation,
    errors: [{ code, message, field }],
  };
}

function operationRequestUpdateErrorResponse(code: ApiErrorCode, message: string, field: string): OperationRequestUpdateApiResponse {
  return {
    ok: false,
    operation: pmsOperationRequestUpdateOperation,
    errors: [{ code, message, field }],
  };
}

function requestOperationFromRecord(record: ApiIdempotencyRecord): PmsSandboxIdempotencyReadback['operation'] {
  return record.response.ok && (
    record.response.operation === pmsCheckInOperation ||
    record.response.operation === pmsCheckOutOperation ||
    record.response.operation === pmsHousekeepingDoneOperation ||
    record.response.operation === pmsHousekeepingInspectionOperation ||
    record.response.operation === pmsHousekeepingReworkOperation ||
    record.response.operation === pmsReportMaintenanceOperation ||
    record.response.operation === pmsMaintenanceDoneOperation ||
    record.response.operation === pmsRestoreSellableOperation
  )
    ? record.response.operation
    : 'unknown';
}

function requestModeFromRecord(record: ApiIdempotencyRecord): CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | 'unknown' {
  return record.response.ok ? record.response.mode : record.response.mode === 'dryRun' || record.response.mode === 'confirm' ? record.response.mode : 'unknown';
}

function requestJsonFromRecord(record: ApiIdempotencyRecord): unknown {
  return record.response.ok ? record.response.request.fingerprintInput : { mode: record.response.mode };
}

function createProjectionFreshness(
  generatedAt: string,
  status: 'fresh' | 'unavailable',
): ReservationReadModel['projectionFreshness'] {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-read-model-current' : 'room-not-found',
  };
}

function propertyCodeFromPropertyId(propertyId: string): string {
  return propertyId === 'property-small-hotel' ? 'small-hotel' : propertyId;
}

function propertyDisplayName(propertyId: string): string {
  return propertyId === 'property-small-hotel' ? 'PMS 小型酒店样板' : propertyId;
}

function propertyTimezone(propertyId: string): string {
  return propertyId === 'property-small-hotel' ? 'Asia/Shanghai' : 'UTC';
}

function roomTypeIdFromDisplayName(roomType: string): string {
  if (roomType === '花园别墅') return 'room-type-garden-villa';
  if (roomType === '秘境洞穴') return 'room-type-cave';
  if (roomType === '花园套房') return 'room-type-garden-suite';
  return `room-type-${sanitizeSlug(roomType)}`;
}

function roomTypeCodeFromRoomTypeId(roomTypeId: string): string {
  if (roomTypeId === 'room-type-garden-villa') return 'garden-villa';
  if (roomTypeId === 'room-type-cave') return 'cave';
  if (roomTypeId === 'room-type-garden-suite') return 'garden-suite';
  return roomTypeId.replace(/^room-type-/, '');
}

function roomTypeDisplayName(roomTypeId: string): string {
  if (roomTypeId === 'room-type-garden-villa') return '花园别墅';
  if (roomTypeId === 'room-type-cave') return '秘境洞穴';
  if (roomTypeId === 'room-type-garden-suite') return '花园套房';
  return roomTypeId;
}

function roomIdFromEvent(event: DomainEvent): string | undefined {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return event.roomId;
  }
  if (event.type === 'HousekeepingTaskCreated') {
    return event.task.roomId;
  }
  return event.roomId;
}

function inventoryDayRoomForStatus(
  room: RoomAggregate,
  propertyId: string,
  businessDate: string,
  availabilityStatus: InventoryAvailabilityStatus,
  sourceRefs: readonly InventorySourceRef[],
  updatedAt: string,
): InventoryDayRoom {
  return {
    businessDate,
    propertyId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    ...(room.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
    ...(room.roomType ? { roomType: room.roomType } : {}),
    availabilityStatus,
    sourceRefs,
    updatedAt,
  };
}

function findOccupiedStayForRoomDate(
  stays: readonly PmsSandboxStayReadback[],
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): PmsSandboxStayReadback | undefined {
  return stays.find((stay) => {
    if (stay.roomId !== roomId || stay.status !== 'inHouse') {
      return false;
    }
    const reservation = reservationsById.get(stay.reservationId);
    const startDate = normalizeBusinessDate(stay.checkedInAt ?? reservation?.arrivalDate ?? businessDate);
    const endDate = normalizeBusinessDate(stay.checkedOutAt ?? reservation?.departureDate ?? addBusinessDays(businessDate, 1));
    return dateInRange(businessDate, startDate, endDate);
  });
}

function findReservedAllocationForRoomDate(
  allocations: readonly PmsSandboxReservationAllocationReadback[],
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): PmsSandboxReservationAllocationReadback | undefined {
  return allocations.find((allocation) => {
    const reservation = reservationsById.get(allocation.reservationId);
    if (allocation.roomId !== roomId || !reservation || reservation.status === 'cancelled' || reservation.status === 'checkedOut') {
      return false;
    }
    return dateInRange(businessDate, allocation.startDate, allocation.endDate);
  });
}

function findReservedReservationForRoomDate(
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): ReservationReadModel | undefined {
  return Array.from(reservationsById.values()).find((reservation) => {
    if (reservation.roomId !== roomId || reservation.status === 'cancelled' || reservation.status === 'checkedOut') {
      return false;
    }
    return dateInRange(businessDate, reservation.arrivalDate, reservation.departureDate);
  });
}

function compressInventoryIntervals(dayRooms: readonly InventoryDayRoom[], updatedAt: string): InventoryIntervalProjection[] {
  const intervals: InventoryIntervalProjection[] = [];
  const rowsByRoom = new Map<string, InventoryDayRoom[]>();
  for (const row of dayRooms) {
    rowsByRoom.set(row.roomId, [...(rowsByRoom.get(row.roomId) ?? []), row]);
  }

  for (const rows of rowsByRoom.values()) {
    rows.sort((left, right) => left.businessDate.localeCompare(right.businessDate));
    let current: InventoryDayRoom | undefined;
    let startDate: string | undefined;
    for (const row of rows) {
      if (!current) {
        current = row;
        startDate = row.businessDate;
        continue;
      }
      if (sameInventoryInterval(current, row)) {
        current = row;
        continue;
      }
      intervals.push(inventoryIntervalFromDayRoom(current, startDate!, row.businessDate, updatedAt));
      current = row;
      startDate = row.businessDate;
    }
    if (current && startDate) {
      intervals.push(inventoryIntervalFromDayRoom(current, startDate, addBusinessDays(current.businessDate, 1), updatedAt));
    }
  }

  return intervals;
}

function sameInventoryInterval(left: InventoryDayRoom, right: InventoryDayRoom): boolean {
  return left.availabilityStatus === right.availabilityStatus && JSON.stringify(left.sourceRefs) === JSON.stringify(right.sourceRefs);
}

function inventoryIntervalFromDayRoom(row: InventoryDayRoom, startDate: string, endDate: string, updatedAt: string): InventoryIntervalProjection {
  const calendarKind = row.availabilityStatus;
  return {
    projectionId: `inventory-${row.roomId}-${startDate}-${endDate}-${calendarKind}`,
    propertyId: row.propertyId,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    ...(row.roomTypeId ? { roomTypeId: row.roomTypeId } : {}),
    ...(row.roomType ? { roomType: row.roomType } : {}),
    startDate,
    endDate,
    calendarKind,
    sellableStatus: calendarKind === 'blocked' ? 'outOfOrder' : 'sellable',
    title: `${row.roomNumber} ${calendarKind}`,
    sourceRefs: row.sourceRefs,
    updatedAt,
  };
}

function summarizeInventoryDayRooms(dayRooms: readonly InventoryDayRoom[], updatedAt: string): InventorySummaryDayType[] {
  const summaries = new Map<string, InventorySummaryDayType>();
  for (const row of dayRooms) {
    const roomTypeId = row.roomTypeId ?? 'room-type-unknown';
    const key = `${row.businessDate}:${row.propertyId}:${roomTypeId}`;
    const current = summaries.get(key) ?? {
      businessDate: row.businessDate,
      propertyId: row.propertyId,
      roomTypeId,
      ...(row.roomType ? { roomType: row.roomType } : {}),
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      blockedRooms: 0,
      reservedRooms: 0,
      updatedAt,
    };
    summaries.set(key, {
      ...current,
      totalRooms: current.totalRooms + 1,
      availableRooms: current.availableRooms + (row.availabilityStatus === 'available' ? 1 : 0),
      occupiedRooms: current.occupiedRooms + (row.availabilityStatus === 'occupied' ? 1 : 0),
      blockedRooms: current.blockedRooms + (row.availabilityStatus === 'blocked' ? 1 : 0),
      reservedRooms: current.reservedRooms + (row.availabilityStatus === 'reserved' ? 1 : 0),
    });
  }
  return Array.from(summaries.values()).sort((left, right) => left.businessDate.localeCompare(right.businessDate) || left.roomTypeId.localeCompare(right.roomTypeId));
}

function inventoryBlockOverlaps(block: InventoryBlock, startDate: string, endDate: string): boolean {
  return block.startDate < endDate && (block.endDate ?? endDate) > startDate;
}

function businessDateRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (let date = startDate; date < endDate; date = addBusinessDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function dateInRange(businessDate: string, startDate: string, endDate: string): boolean {
  return businessDate >= normalizeBusinessDate(startDate) && businessDate < normalizeBusinessDate(endDate);
}

function normalizeInventoryHorizonDays(value: number | undefined): number {
  if (value === 30 || value === 60 || value === 90) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(90, Math.max(1, Math.trunc(value)));
  }
  return 60;
}

function addBusinessDays(startDate: string, days: number): string {
  const date = new Date(`${normalizeBusinessDate(startDate)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeBusinessDate(value: string): string {
  return value.slice(0, 10);
}

function parseJson<TValue>(raw: string): TValue {
  return JSON.parse(raw) as TValue;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toStableJsonValue(entryValue)]),
    );
  }
  return value ?? null;
}

function operationRequestIdFromClientToken(clientToken: string): string {
  const digest = createHash('sha256').update(clientToken).digest('hex').slice(0, 12);
  return `opreq-${sanitizeSlug(clientToken).slice(0, 48)}-${digest}`;
}

function stayIdForCheckIn(reservationId: string, roomId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${reservationId}:${roomId}:${idempotencyKey}`).digest('hex').slice(0, 12);
  return `stay-${sanitizeSlug(reservationId).slice(0, 32)}-${sanitizeSlug(roomId).slice(0, 24)}-${digest}`;
}

function stayIdForReservationRoom(reservationId: string, roomId: string): string {
  const digest = createHash('sha256').update(`${reservationId}:${roomId}`).digest('hex').slice(0, 12);
  return `stay-${sanitizeSlug(reservationId).slice(0, 32)}-${sanitizeSlug(roomId).slice(0, 24)}-${digest}`;
}

function nonEmptyString(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

function optionalString(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function operationRequestListLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function sameBusinessDate(value: string, businessDate: string): boolean {
  return value.slice(0, 10) === businessDate.slice(0, 10);
}

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function cloneValue<TValue>(value: TValue): TValue {
  if (value === undefined) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

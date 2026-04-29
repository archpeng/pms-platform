import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AuditEntry,
  DomainEvent,
  HousekeepingTask,
  MaintenanceTicket,
  ReservationReadModel,
  RoomReservationContextReadModel,
  TodayReservationsReadModel,
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
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckOutApiRequest,
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
    const properties = this.listProperties();
    const roomTypes = this.listRoomTypes();
    const rooms = roomId ? this.getRoomsByRoomId(roomId) : this.listRooms();
    const roomIds = new Set(rooms.map((room) => room.roomId));
    const reservations = roomId ? this.listReservationsByRoomIds(roomIds) : this.listReservations();
    const reservationAllocations = roomId ? this.listReservationAllocationsByRoomIds(roomIds) : this.listReservationAllocations();
    const stays = roomId ? this.listStaysByRoomIds(roomIds) : this.listStays();
    const housekeepingTasks = roomId ? this.listHousekeepingTasksByRoomIds(roomIds) : this.listHousekeepingTasks();
    const maintenanceTickets = roomId ? this.listMaintenanceTicketsByRoomIds(roomIds) : this.listMaintenanceTickets();
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
    const imported: ReservationReadModel[] = [];
    for (const reservation of reservations) {
      imported.push(this.saveReservationImportRecord(reservation));
    }
    return {
      importedCount: imported.length,
      reservations: imported,
    };
  }

  runInTransaction<TValue>(operation: () => TValue): TValue {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
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

      CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON rooms(room_number);
      CREATE INDEX IF NOT EXISTS idx_room_types_property_id ON room_types(property_id);
      CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_room_id ON maintenance_tickets(room_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON reservations(room_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_arrival_date ON reservations(arrival_date);
      CREATE INDEX IF NOT EXISTS idx_reservations_departure_date ON reservations(departure_date);
      CREATE INDEX IF NOT EXISTS idx_reservation_allocations_room_id ON reservation_room_allocations(room_id);
      CREATE INDEX IF NOT EXISTS idx_stays_room_id ON stays(room_id);
      CREATE INDEX IF NOT EXISTS idx_audits_room_id ON audits(room_id);
      CREATE INDEX IF NOT EXISTS idx_audits_correlation_id ON audits(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_audits_idempotency_key ON audits(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_events_room_id ON domain_events(room_id);
      CREATE INDEX IF NOT EXISTS idx_domain_events_event_type ON domain_events(event_type);
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
      DELETE FROM domain_events;
      DELETE FROM audits;
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
          SELECT stay_id, reservation_id, room_id, room_number, checked_in_at, checked_out_at, status
          FROM stays
          ORDER BY created_at, stay_id
        `,
      )
      .all() as Array<{
        stay_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        checked_in_at?: string | null;
        checked_out_at?: string | null;
        status: string;
      }>;
    return rows.map((row) => ({
      stayId: row.stay_id,
      reservationId: row.reservation_id,
      ...(row.room_id ? { roomId: row.room_id } : {}),
      ...(row.room_number ? { roomNumber: row.room_number } : {}),
      ...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
      ...(row.checked_out_at ? { checkedOutAt: row.checked_out_at } : {}),
      status: row.status,
    }));
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

    if (record.stay || record.status === 'checkedIn' || record.status === 'checkedOut') {
      this.saveStay(record.reservationId, {
        stayId: record.stay?.stayId ?? `stay-${record.reservationId}`,
        roomId: record.stay?.roomId ?? record.roomId ?? room?.roomId,
        roomNumber: record.stay?.roomNumber ?? record.roomNumber ?? room?.roomNumber,
        checkedInAt: record.stay?.checkedInAt ?? (record.status === 'checkedIn' || record.status === 'checkedOut' ? createdAt : undefined),
        checkedOutAt: record.stay?.checkedOutAt,
        status: record.stay?.status ?? (record.status === 'checkedOut' ? 'checkedOut' : 'checkedIn'),
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
  }

  private saveStay(
    reservationId: string,
    stay: {
      stayId: string;
      roomId?: string;
      roomNumber?: string;
      checkedInAt?: string;
      checkedOutAt?: string;
      status: string;
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
    const rows = this.db
      .prepare(
        `
          SELECT stay_id, reservation_id, room_id, room_number, checked_in_at, checked_out_at, status
          FROM stays
          WHERE reservation_id = ?
          ORDER BY updated_at DESC, stay_id DESC
        `,
      )
      .all(reservationId) as Array<{
        stay_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        checked_in_at?: string | null;
        checked_out_at?: string | null;
        status: string;
      }>;
    const row = rows[0];
    return row
      ? {
          stayId: row.stay_id,
          reservationId: row.reservation_id,
          ...(row.room_id ? { roomId: row.room_id } : {}),
          ...(row.room_number ? { roomNumber: row.room_number } : {}),
          ...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
          ...(row.checked_out_at ? { checkedOutAt: row.checked_out_at } : {}),
          status: row.status,
        }
      : undefined;
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
      status: stay?.status === 'checkedIn'
        ? 'checkedIn'
        : stay?.status === 'checkedOut'
          ? 'checkedOut'
          : row.status,
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
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

function apiIdempotencyFromRow(row: ApiIdempotencyRow): ApiIdempotencyRecord {
  return {
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    response: parseJson<ApiIdempotencyRecord['response']>(row.response_json),
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

function parseJson<TValue>(raw: string): TValue {
  return JSON.parse(raw) as TValue;
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

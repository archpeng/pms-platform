import {
  isOperationRequestSource,
  isOperationRequestStatus,
  isSupportedOperationRequestAction,
  type AuditEntry,
  type DomainEvent,
  type HousekeepingTask,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryDayRoom,
  type InventoryHorizonRequest,
  type InventoryIntervalProjection,
  type InventoryReadModel,
  type InventorySummaryDayType,
  type MaintenanceTicket,
  type OperationRequest,
  type ProjectionOutboxEntry,
  type ReservationDraftAuditRef,
  type ReservationDraftEvidenceRef,
  type ReservationDraftMissingSlot,
  type PendingActionReadModel,
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftWorkflowRef,
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftEvidenceRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftWorkflowRef,
  type ReservationGroupRoomSelection,
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
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckInConfirmApiRequest,
  type CheckOutConfirmApiRequest,
  type OperationRequestCreateApiRequest,
  type OperationRequestCreateApiResponse,
  type OperationRequestGetApiRequest,
  type OperationRequestGetApiResponse,
  type OperationRequestListApiRequest,
  type OperationRequestListApiResponse,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type OperationRequestUpdateApiRequest,
  type OperationRequestUpdateApiResponse,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
  type PendingActionCancelApiRequest,
  type PendingActionConfirmApiRequest,
  type PendingActionStatusApiRequest,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
  type ReservationDraftWorkflowApiResponse,
  type ReservationGroupDraftCancelApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationGroupDraftUpdateApiRequest,
  type ReservationGroupDraftWorkflowApiResponse,
  type ReservationGroupPrepareConfirmApiRequest,
  type ReservationGroupQuoteApiRequest,
} from '../index.js';
import {
  pmsSandboxStateVersion,
  type PmsSandboxPropertyReadback,
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxReservationImportRecord,
  type PmsSandboxRoomTypeReadback,
  type PmsSandboxStayReadback,
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchListOptions,
  type ProjectionDispatchMarkOptions,
  type ProjectionDispatchStatus,
  type ProjectionDispatchWorkItem,
  type PmsSandboxReadback,
} from '../localSandbox.js';
import { deriveProjectionOutboxEntries } from './projectionOutbox.js';
import {
  ApiIdempotencyRow,
  InventoryBlockRow,
  InventoryDayRoomRow,
  InventoryIntervalProjectionRow,
  InventorySummaryDayTypeRow,
  JsonPayloadRow,
  OperationRequestRow,
  ProjectionDispatchLedgerRow,
  ReservationDraftAuditPayloadRow,
  ReservationDraftAuditRow,
  ReservationDraftRow,
  ReservationGroupDraftAuditPayloadRow,
  ReservationGroupDraftRow,
  ReservationRow,
  RoomRow,
  StayRow,
  StoredReservationDraft,
  StoredReservationGroupDraft,
  addBusinessDays,
  addHoursIso,
  apiIdempotencyFromRow,
  businessDateRange,
  cloneValue,
  compressInventoryIntervals,
  createProjectionFreshness,
  dateInRange,
  dateRangesOverlap,
  deriveGroupMissingSlots,
  deriveMissingSlots,
  draftStatusFromMissingSlots,
  findOccupiedStayForRoomDate,
  findReservedAllocationForRoomDate,
  findReservedReservationForRoomDate,
  groupDraftStatusFromMissingSlots,
  hasCompleteGroupSelections,
  housekeepingTaskIdFromEvent,
  inventoryBlockFromRow,
  inventoryBlockOverlaps,
  inventoryDayRoomForStatus,
  inventoryDayRoomFromRow,
  inventoryIntervalFromDayRoom,
  inventoryIntervalProjectionFromRow,
  inventorySummaryDayTypeFromRow,
  isPendingActionCallbackResponse,
  mergeEvidenceRefs,
  nonEmptyString,
  normalizeBusinessDate,
  normalizeInventoryHorizonDays,
  normalizeStayStatus,
  operationRequestCreateErrorResponse,
  operationRequestFromRow,
  operationRequestIdFromClientToken,
  operationRequestListLimit,
  operationRequestUpdateErrorResponse,
  optionalString,
  parseJson,
  pendingActionCardPayloadMismatchResponse,
  pendingActionCardPayloadMismatchResponseFromGroup,
  pendingActionExpiredResponse,
  pendingActionExpiredResponseFromGroup,
  pendingActionFallbackOperation,
  pendingActionInactiveResponse,
  pendingActionInactiveResponseFromGroup,
  pendingActionNotFoundResponse,
  pendingActionReadModelFromDraft,
  pendingActionReadModelFromGroupDraft,
  pendingActionRejectedResponse,
  pendingActionSuccessResponse,
  pendingActionSuccessResponseFromGroup,
  pendingActionTokenConflictResponse,
  projectionDispatchLedgerFromRow,
  propertyCodeFromPropertyId,
  propertyDisplayName,
  propertyTimezone,
  redactedPendingActionAuditPayload,
  requestJsonFromRecord,
  requestModeFromRecord,
  requestOperationFromRecord,
  reservationCodeFromDraft,
  reservationDraftAuditId,
  reservationDraftDerivedRef,
  reservationDraftFromRow,
  reservationDraftIdFromClientToken,
  reservationDraftInactiveResponse,
  reservationDraftMissingSlotsResponse,
  reservationDraftNotFoundResponse,
  reservationDraftPendingAction,
  reservationDraftQuote,
  reservationDraftQuoteMismatchResponse,
  reservationDraftQuoteRequiredResponse,
  reservationDraftRef,
  reservationDraftRefFromStored,
  reservationDraftRejectedResponse,
  reservationDraftSuccessResponse,
  reservationDraftTokenConflictResponse,
  reservationGroupDraftAuditId,
  reservationGroupDraftFromRow,
  reservationGroupDraftIdFromClientToken,
  reservationGroupDraftInactiveResponse,
  reservationGroupDraftMissingSlotsResponse,
  reservationGroupDraftNotFoundResponse,
  reservationGroupDraftPendingAction,
  reservationGroupDraftQuote,
  reservationGroupDraftQuoteMismatchResponse,
  reservationGroupDraftQuoteRequiredResponse,
  reservationGroupDraftRef,
  reservationGroupDraftRefFromStored,
  reservationGroupDraftRejectedResponse,
  reservationGroupDraftSuccessResponse,
  reservationGroupDraftTokenConflictResponse,
  reservationGroupQuoteRef,
  reservationIdFromDraft,
  reservationQuoteRef,
  roomFromRow,
  roomIdFromEvent,
  roomTypeCodeFromRoomTypeId,
  roomTypeDisplayName,
  roomTypeIdFromDisplayName,
  sameBusinessDate,
  sameInventoryInterval,
  sanitizeSlug,
  stableJsonStringify,
  stableRefHash,
  stayFromRow,
  stayIdForCheckIn,
  stayIdForReservationRoom,
  summarizeInventoryDayRooms,
  toStableJsonValue
} from './model.js';
import { SqliteSandboxBase } from './baseStore.js';

export abstract class SqliteSandboxCoreStore extends SqliteSandboxBase {
  protected abstract closeActiveStopSellBlocks(roomId: string, timestamp: string): void;
  protected abstract upsertMaintenanceInventoryBlock(ticket: MaintenanceTicket): void;

  protected createCorePorts(): CorePorts {
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

  protected createCoreIdempotencyRepository(): IdempotencyRepository<CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult> {
    return {
      get: (idempotencyKey) => cloneValue(this.getCoreIdempotency(idempotencyKey)),
      save: (idempotencyKey, response) => this.saveCoreIdempotency(idempotencyKey, response),
      has: (idempotencyKey) => Boolean(this.getCoreIdempotency(idempotencyKey)),
    };
  }

  protected createDomainEventCollector(): DomainEventCollector {
    return {
      append: (event) => this.appendDomainEvent(event),
      list: () => cloneValue(this.listDomainEvents()),
      clear: () => {
        this.db.prepare('DELETE FROM domain_events').run();
      },
    };
  }

  protected createApiIdempotencyRepository(): ApiIdempotencyRepository {
    return {
      get: (idempotencyKey) => cloneValue(this.getApiIdempotency(idempotencyKey)),
      save: (record) => this.saveApiIdempotency(record),
      list: () => cloneValue(this.listApiIdempotencyRecords()),
    };
  }

  protected getRoom(roomId: string): RoomAggregate | undefined {
    const row = this.db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(roomId) as RoomRow | undefined;
    return row ? roomFromRow(row) : undefined;
  }

  protected getRoomsByRoomId(roomId: string): RoomAggregate[] {
    return this.getRoom(roomId) ? [this.getRoom(roomId)!] : [];
  }

  protected listRooms(): RoomAggregate[] {
    const rows = this.db.prepare('SELECT * FROM rooms ORDER BY room_number, room_id').all() as unknown as RoomRow[];
    return rows.map(roomFromRow);
  }

  protected saveRoom(room: RoomAggregate): void {
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

  protected seedCatalogFromRooms(rooms: readonly RoomAggregate[]): void {
    for (const room of rooms) {
      this.ensureCatalogForRoom(room);
    }
  }

  protected ensureCatalogForRoom(room: RoomAggregate): void {
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

  protected listProperties(): PmsSandboxPropertyReadback[] {
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

  protected listRoomTypes(): PmsSandboxRoomTypeReadback[] {
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

  protected getHousekeepingTask(taskId: string): HousekeepingTask | undefined {
    const row = this.db.prepare('SELECT payload_json FROM housekeeping_tasks WHERE task_id = ?').get(taskId) as JsonPayloadRow | undefined;
    return row ? parseJson<HousekeepingTask>(row.payload_json) : undefined;
  }

  protected listHousekeepingTasks(): HousekeepingTask[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM housekeeping_tasks ORDER BY created_at, task_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<HousekeepingTask>(row.payload_json));
  }

  protected listHousekeepingTasksByRoomIds(roomIds: ReadonlySet<string>): HousekeepingTask[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listHousekeepingTasks().filter((task) => roomIds.has(task.roomId));
  }

  protected saveHousekeepingTask(task: HousekeepingTask): void {
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

  protected getMaintenanceTicket(ticketId: string): MaintenanceTicket | undefined {
    const row = this.db.prepare('SELECT payload_json FROM maintenance_tickets WHERE ticket_id = ?').get(ticketId) as JsonPayloadRow | undefined;
    return row ? parseJson<MaintenanceTicket>(row.payload_json) : undefined;
  }

  protected listMaintenanceTickets(): MaintenanceTicket[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM maintenance_tickets ORDER BY created_at, ticket_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<MaintenanceTicket>(row.payload_json));
  }

  protected listMaintenanceTicketsByRoomIds(roomIds: ReadonlySet<string>): MaintenanceTicket[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listMaintenanceTickets().filter((ticket) => roomIds.has(ticket.roomId));
  }

  protected saveMaintenanceTicket(ticket: MaintenanceTicket): void {
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

  protected getReservationDraftAuditPayload(auditId: string): ReservationDraftAuditPayloadRow | undefined {
    return this.db
      .prepare('SELECT audit_id, draft_id, action, occurred_at, payload_json FROM reservation_draft_audits WHERE audit_id = ?')
      .get(auditId) as ReservationDraftAuditPayloadRow | undefined;
  }

  protected getReservationGroupDraftAuditPayload(auditId: string): ReservationGroupDraftAuditPayloadRow | undefined {
    return this.db
      .prepare('SELECT audit_id, group_draft_id, action, occurred_at, payload_json FROM reservation_group_draft_audits WHERE audit_id = ?')
      .get(auditId) as ReservationGroupDraftAuditPayloadRow | undefined;
  }

  protected appendAudit(entry: AuditEntry): void {
    this.db
      .prepare(
        `
          INSERT INTO audits (audit_id, room_id, command_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(entry.auditId, entry.roomId, entry.commandType, entry.correlationId, entry.idempotencyKey, entry.occurredAt, JSON.stringify(entry));
  }

  protected listAudits(): AuditEntry[] {
    const rows = this.db.prepare('SELECT payload_json FROM audits ORDER BY occurred_at, audit_id').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<AuditEntry>(row.payload_json));
  }

  protected listAuditsByRoomIds(roomIds: ReadonlySet<string>): AuditEntry[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listAudits().filter((entry) => roomIds.has(entry.roomId));
  }

  protected appendDomainEvent(event: DomainEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO domain_events (event_id, room_id, event_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(event.eventId, roomIdFromEvent(event) ?? null, event.type, event.correlationId, event.idempotencyKey, event.occurredAt, JSON.stringify(event));
  }

  protected listDomainEvents(): DomainEvent[] {
    const rows = this.db.prepare('SELECT payload_json FROM domain_events ORDER BY sequence').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<DomainEvent>(row.payload_json));
  }

  protected listDomainEventsByRoomIds(roomIds: ReadonlySet<string>): DomainEvent[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listDomainEvents().filter((event) => {
      const roomId = roomIdFromEvent(event);
      return roomId ? roomIds.has(roomId) : false;
    });
  }

  protected getCoreIdempotency(idempotencyKey: string): CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult | undefined {
    const row = this.db.prepare('SELECT response_json FROM core_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | { response_json: string }
      | undefined;
    return row ? parseJson<CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult>(row.response_json) : undefined;
  }

  protected saveCoreIdempotency(idempotencyKey: string, response: CoreCheckInConfirmResult | CoreCheckOutConfirmResult | CorePmsCommandConfirmResult): void {
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

  protected getApiIdempotency(idempotencyKey: string): ApiIdempotencyRecord | undefined {
    const row = this.db.prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | ApiIdempotencyRow
      | undefined;
    return row ? apiIdempotencyFromRow(row) : undefined;
  }

  protected listApiIdempotencyRecords(): ApiIdempotencyRecord[] {
    const rows = this.db
      .prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency ORDER BY created_at, idempotency_key')
      .all() as unknown as ApiIdempotencyRow[];
    return rows.map(apiIdempotencyFromRow);
  }

  protected saveApiIdempotency(record: ApiIdempotencyRecord): void {
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

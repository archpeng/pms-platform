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
import { SqliteSandboxWorkflowStore } from './workflowStore.js';

export abstract class SqliteSandboxDispatchStore extends SqliteSandboxWorkflowStore {
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
    const reservationDrafts = this.listReservationDrafts();
    const reservationGroupDrafts = this.listReservationGroupDrafts();
    const reservationDraftAudits = this.listReservationDraftAudits();
    const reservationGroupDraftAudits = this.listReservationGroupDraftAudits();
    const operationRequests = roomId ? this.listOperationRequestsByRoomIds(roomIds) : this.listOperationRequestRecords();
    const audits = roomId ? this.listAuditsByRoomIds(roomIds) : this.listAudits();
    const domainEvents = roomId ? this.listDomainEventsByRoomIds(roomIds) : this.listDomainEvents();
    const idempotencyRecords = this.listApiIdempotencyRecords().map((record) => ({
      operation: requestOperationFromRecord(record),
      mode: requestModeFromRecord(record),
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      ok: record.response.ok,
    }));
    const projectionOutbox = deriveProjectionOutboxEntries({
      domainEvents,
      reservations,
      reservationDraftAudits,
      reservationGroupDraftAudits,
      operationRequests,
      idempotencyRecords,
      generatedAt: this.now(),
    });

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
      reservationDrafts: cloneValue(reservationDrafts),
      reservationGroupDrafts: cloneValue(reservationGroupDrafts),
      reservationDraftAudits: cloneValue(reservationDraftAudits),
      reservationGroupDraftAudits: cloneValue(reservationGroupDraftAudits),
      operationRequests: cloneValue(operationRequests),
      housekeepingTasks: cloneValue(housekeepingTasks),
      maintenanceTickets: cloneValue(maintenanceTickets),
      audits: cloneValue(audits),
      domainEvents: cloneValue(domainEvents),
      projectionOutbox: cloneValue(projectionOutbox),
      idempotencyRecords: cloneValue(idempotencyRecords),
    };
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

  listProjectionDispatchWork(options: ProjectionDispatchListOptions = {}): readonly ProjectionDispatchWorkItem[] {
    return this.runInTransaction(() => {
      const generatedAt = options.now ?? this.now();
      const dueAt = options.now ?? generatedAt;
      const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
      const entries = this.deriveCurrentProjectionOutbox(generatedAt);
      this.ensureProjectionDispatchLedger(entries, generatedAt);

      const items: ProjectionDispatchWorkItem[] = [];
      for (const entry of entries) {
        const ledger = this.getProjectionDispatchLedgerEntry(entry.outboxEntryId);
        if (!entry || !ledger) continue;
        if (ledger.status !== 'pending' && ledger.status !== 'retryable') continue;
        if (ledger.nextAttemptAt && ledger.nextAttemptAt > dueAt) continue;
        items.push(this.buildProjectionDispatchWorkItem(entry, ledger));
        if (items.length >= limit) break;
      }
      return cloneValue(items);
    });
  }

  markProjectionDispatchDelivered(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() => this.updateProjectionDispatchLedger(options, 'delivered'));
  }

  markProjectionDispatchRetryable(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() => this.updateProjectionDispatchLedger(options, 'retryable'));
  }

  markProjectionDispatchFailed(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() => this.updateProjectionDispatchLedger(options, 'failed'));
  }

  markProjectionDispatchSkipped(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() => this.updateProjectionDispatchLedger(options, 'skipped'));
  }

  protected createOperationRequestRecord(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse {
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

  protected updateOperationRequestRecord(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse {
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

  protected findOperationRequest(request: OperationRequestGetApiRequest | OperationRequestUpdateApiRequest): OperationRequest | undefined {
    if (request.operationRequestId) {
      return this.getOperationRequestById(request.operationRequestId);
    }
    if (request.clientToken) {
      return this.getOperationRequestByClientToken(request.clientToken);
    }
    return undefined;
  }

  protected getOperationRequestById(operationRequestId: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE operation_request_id = ?').get(operationRequestId) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  protected getOperationRequestByClientToken(clientToken: string): OperationRequest | undefined {
    const row = this.db.prepare('SELECT * FROM operation_requests WHERE client_token = ?').get(clientToken) as OperationRequestRow | undefined;
    return row ? operationRequestFromRow(row) : undefined;
  }

  protected listOperationRequestRecords(): OperationRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM operation_requests ORDER BY created_at, operation_request_id')
      .all() as unknown as OperationRequestRow[];
    return rows.map(operationRequestFromRow);
  }

  protected listOperationRequestsByRoomIds(roomIds: ReadonlySet<string>): OperationRequest[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listOperationRequestRecords().filter((request) => request.roomId ? roomIds.has(request.roomId) : false);
  }

  protected saveOperationRequest(request: OperationRequest): void {
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

  protected deriveCurrentProjectionOutbox(generatedAt: string): ProjectionOutboxEntry[] {
    const idempotencyRecords = this.listApiIdempotencyRecords().map((record) => ({
      operation: requestOperationFromRecord(record),
      mode: requestModeFromRecord(record),
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      ok: record.response.ok,
    }));
    return deriveProjectionOutboxEntries({
      domainEvents: this.listDomainEvents(),
      reservations: this.listReservations(),
      reservationDraftAudits: this.listReservationDraftAudits(),
      reservationGroupDraftAudits: this.listReservationGroupDraftAudits(),
      operationRequests: this.listOperationRequestRecords(),
      idempotencyRecords,
      generatedAt,
    });
  }

  protected ensureProjectionDispatchLedger(entries: readonly ProjectionOutboxEntry[], now: string): void {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO projection_dispatch_ledger (
        outbox_entry_id, status, attempt_count, next_attempt_at, redacted_error, created_at, updated_at
      )
      VALUES (?, ?, 0, ?, ?, ?, ?)
    `);
    for (const entry of entries) {
      const status: ProjectionDispatchStatus = entry.status === 'skipped' ? 'skipped' : entry.status === 'retryable' ? 'retryable' : 'pending';
      statement.run(
        entry.outboxEntryId,
        status,
        entry.nextAttemptAt ?? (status === 'retryable' ? entry.updatedAt : null),
        entry.redactedError ?? null,
        now,
        now,
      );
    }
  }

  protected getProjectionDispatchLedgerEntry(outboxEntryId: string): ProjectionDispatchLedgerEntry | undefined {
    const row = this.db
      .prepare('SELECT * FROM projection_dispatch_ledger WHERE outbox_entry_id = ?')
      .get(outboxEntryId) as ProjectionDispatchLedgerRow | undefined;
    return row ? projectionDispatchLedgerFromRow(row) : undefined;
  }

  protected updateProjectionDispatchLedger(options: ProjectionDispatchMarkOptions, status: ProjectionDispatchStatus): void {
    this.db
      .prepare(
        `
          UPDATE projection_dispatch_ledger
          SET status = ?,
              attempt_count = attempt_count + 1,
              adapter_operation = ?,
              adapter_status_code = ?,
              last_attempt_at = ?,
              next_attempt_at = ?,
              redacted_error = ?,
              updated_at = ?
          WHERE outbox_entry_id = ?
        `,
      )
      .run(
        status,
        options.adapterOperation ?? null,
        options.adapterStatusCode ?? null,
        options.attemptedAt,
        options.nextAttemptAt ?? null,
        options.redactedError ?? null,
        options.attemptedAt,
        options.outboxEntryId,
      );
  }

  protected buildProjectionDispatchWorkItem(entry: ProjectionOutboxEntry, ledger: ProjectionDispatchLedgerEntry): ProjectionDispatchWorkItem {
    if (entry.sourceType === 'domainEvent') {
      const event = this.listDomainEvents().find((candidate) => candidate.eventId === entry.sourceRef);
      const roomId = event ? roomIdFromEvent(event) : undefined;
      const room = roomId ? this.getRoom(roomId) : undefined;
      const housekeepingTask = event && (event.type === 'HousekeepingTaskCreated' || event.type.startsWith('Housekeeping'))
        ? this.getHousekeepingTask(housekeepingTaskIdFromEvent(event))
        : undefined;
      const maintenanceTicket = event && (event.type === 'MaintenanceReported' || event.type === 'MaintenanceCompleted')
        ? this.getMaintenanceTicket(event.ticket.ticketId)
        : undefined;
      return {
        entry,
        ledger,
        ...(event ? { domainEvent: event } : {}),
        ...(room ? { room } : {}),
        ...(housekeepingTask ? { housekeepingTask } : {}),
        ...(maintenanceTicket ? { maintenanceTicket } : {}),
      };
    }

    if (entry.sourceType === 'reservation') {
      const row = this.getReservationRowById(entry.sourceRef);
      const reservation = row ? this.reservationReadModelFromRow(row, entry.generatedAt) : undefined;
      const room = reservation?.roomId ? this.getRoom(reservation.roomId) : undefined;
      return {
        entry,
        ledger,
        ...(reservation ? { reservation } : {}),
        ...(room ? { room } : {}),
      };
    }

    if (entry.sourceType === 'reservationDraftAudit') {
      const audit = this.getReservationDraftAuditPayload(entry.sourceRef);
      const draft = audit ? this.getReservationDraftById(audit.draft_id) : undefined;
      const selectedRooms = draft?.slots.roomId ? [this.getRoom(draft.slots.roomId)].filter((room): room is RoomAggregate => Boolean(room)) : [];
      return {
        entry,
        ledger,
        ...(selectedRooms.length > 0 ? { selectedRooms } : {}),
        ...(audit ? { audit: { auditId: audit.audit_id, action: audit.action, occurredAt: audit.occurred_at, payload: parseJson<unknown>(audit.payload_json) } } : {}),
        ...(draft ? {
          reservationWorkflow: {
            workflowType: 'reservation',
            propertyId: draft.propertyId,
            clientToken: draft.clientToken,
            requestFingerprint: draft.requestFingerprint,
            draft: reservationDraftRefFromStored(draft, audit ? [{ auditId: audit.audit_id, action: audit.action, occurredAt: audit.occurred_at }] : [], { includeDraftId: true }),
          },
        } : {}),
      };
    }

    if (entry.sourceType === 'reservationGroupDraftAudit') {
      const audit = this.getReservationGroupDraftAuditPayload(entry.sourceRef);
      const draft = audit ? this.getReservationGroupDraftById(audit.group_draft_id) : undefined;
      const selectedRooms = draft?.slots.selections
        ?.map((selection) => this.getRoom(selection.roomId))
        .filter((room): room is RoomAggregate => Boolean(room)) ?? [];
      return {
        entry,
        ledger,
        ...(selectedRooms.length > 0 ? { selectedRooms } : {}),
        ...(audit ? { audit: { auditId: audit.audit_id, action: audit.action, occurredAt: audit.occurred_at, payload: parseJson<unknown>(audit.payload_json) } } : {}),
        ...(draft ? {
          reservationWorkflow: {
            workflowType: 'reservationGroup',
            propertyId: draft.propertyId,
            clientToken: draft.clientToken,
            requestFingerprint: draft.requestFingerprint,
            groupDraft: reservationGroupDraftRefFromStored(draft, audit ? [{ auditId: audit.audit_id, action: audit.action, occurredAt: audit.occurred_at }] : [], { includeGroupDraftId: true }),
          },
        } : {}),
      };
    }

    if (entry.sourceType === 'operationRequest') {
      const operationRequest = this.getOperationRequestById(entry.sourceRef);
      return { entry, ledger, ...(operationRequest ? { operationRequest } : {}) };
    }

    return { entry, ledger };
  }
}

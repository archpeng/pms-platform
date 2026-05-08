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
import { SqliteSandboxWorkflowTablesStore } from './workflowTablesStore.js';

export abstract class SqliteSandboxWorkflowStore extends SqliteSandboxWorkflowTablesStore {
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.readPendingActionRecord(request));
  }

  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.transitionPendingActionRecord(request, 'confirmed'));
  }

  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.transitionPendingActionRecord(request, 'cancelled'));
  }

  createReservationDraft(request: ReservationDraftCreateApiRequest): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.createReservationDraftRecord(request));
  }

  updateReservationDraft(request: ReservationDraftUpdateApiRequest): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.updateReservationDraftRecord(request));
  }

  quoteReservationDraft(request: ReservationQuoteApiRequest): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.quoteReservationDraftRecord(request));
  }

  prepareConfirmReservationDraft(request: ReservationPrepareConfirmApiRequest): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.prepareConfirmReservationDraftRecord(request));
  }

  cancelReservationDraft(request: ReservationDraftCancelApiRequest): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.cancelReservationDraftRecord(request));
  }

  createReservationGroupDraft(request: ReservationGroupDraftCreateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.createReservationGroupDraftRecord(request));
  }

  updateReservationGroupDraft(request: ReservationGroupDraftUpdateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.updateReservationGroupDraftRecord(request));
  }

  quoteReservationGroupDraft(request: ReservationGroupQuoteApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.quoteReservationGroupDraftRecord(request));
  }

  prepareConfirmReservationGroupDraft(request: ReservationGroupPrepareConfirmApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.prepareConfirmReservationGroupDraftRecord(request));
  }

  cancelReservationGroupDraft(request: ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.cancelReservationGroupDraftRecord(request));
  }

  protected createReservationDraftRecord(request: ReservationDraftCreateApiRequest): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const expiresAt = nonEmptyString(request.expiresAt, addHoursIso(createdAt, 24));
    const slots = cloneValue(request.slots ?? {});
    const missingSlots = deriveMissingSlots(slots);
    const status = draftStatusFromMissingSlots(missingSlots, expiresAt, createdAt);
    const draft: StoredReservationDraft = {
      draftId: reservationDraftIdFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, 'property-unknown'),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs: cloneValue(request.evidenceRefs ?? []),
      expiresAt,
      createdAt,
      updatedAt: createdAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(draft.draftId, status === 'expired' ? 'expired' : 'created', createdAt, { request });
    const response = reservationDraftSuccessResponse(request.operation, 'created', draft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected updateReservationDraftRecord(request: ReservationDraftUpdateApiRequest): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const slots = { ...existing.slots, ...(request.slots ?? {}) };
    const evidenceRefs = mergeEvidenceRefs(existing.evidenceRefs, request.evidenceRefs ?? []);
    const missingSlots = cloneValue(request.missingSlots ?? deriveMissingSlots(slots));
    const status = existing.status === 'cancelled' ? 'cancelled' : draftStatusFromMissingSlots(missingSlots, existing.expiresAt, updatedAt);
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs,
      quote: status === 'cancelled' ? existing.quote : undefined,
      pendingAction: status === 'cancelled' ? existing.pendingAction : undefined,
      updatedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(draft.draftId, status === 'expired' ? 'expired' : 'updated', updatedAt, { request });
    const response = reservationDraftSuccessResponse(request.operation, 'updated', draft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected quoteReservationDraftRecord(request: ReservationQuoteApiRequest): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);

    const quotedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationDraftInactiveResponse(request, existing, quotedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationDraftMissingSlotsResponse(request, existing);

    const quote = reservationDraftQuote(existing, quotedAt);
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'quoteReady',
      quote,
      updatedAt: quotedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(draft.draftId, 'quoted', quotedAt, { request, quoteRef: quote.quoteRef });
    const response = reservationDraftSuccessResponse(request.operation, 'quoted', draft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected prepareConfirmReservationDraftRecord(request: ReservationPrepareConfirmApiRequest): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);

    const preparedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationDraftInactiveResponse(request, existing, preparedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationDraftMissingSlotsResponse(request, existing);
    if (!existing.quote) return reservationDraftQuoteRequiredResponse(request, existing);
    if (request.quoteRef && request.quoteRef !== existing.quote.quoteRef) return reservationDraftQuoteMismatchResponse(request, existing);

    const pendingAction = reservationDraftPendingAction(existing, existing.quote.quoteRef, preparedAt);
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'awaitingConfirmation',
      pendingAction,
      updatedAt: preparedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(draft.draftId, 'prepared', preparedAt, {
      request,
      pendingActionRef: pendingAction.pendingActionRef,
      cardPayloadRef: pendingAction.cardPayloadRef,
    });
    const response = reservationDraftSuccessResponse(request.operation, 'prepared', draft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected cancelReservationDraftRecord(request: ReservationDraftCancelApiRequest): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'cancelled',
      updatedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(draft.draftId, 'cancelled', updatedAt, { request, reason: request.reason });
    const response = reservationDraftSuccessResponse(request.operation, 'cancelled', draft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected reservationDraftReplayOrConflict(request: ReservationDraftCreateApiRequest | ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest): ReservationDraftWorkflowApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return reservationDraftTokenConflictResponse(request);
    }
    return cloneValue(existing.response) as ReservationDraftWorkflowApiResponse;
  }

  protected createReservationGroupDraftRecord(request: ReservationGroupDraftCreateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const expiresAt = nonEmptyString(request.expiresAt, addHoursIso(createdAt, 24));
    const slots = cloneValue(request.slots ?? {});
    const missingSlots = deriveGroupMissingSlots(slots);
    const status = groupDraftStatusFromMissingSlots(missingSlots, expiresAt, createdAt);
    const groupDraft: StoredReservationGroupDraft = {
      groupDraftId: reservationGroupDraftIdFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, 'property-unknown'),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs: cloneValue(request.evidenceRefs ?? []),
      expiresAt,
      createdAt,
      updatedAt: createdAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, status === 'expired' ? 'expired' : 'created', createdAt, { request });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'created', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected updateReservationGroupDraftRecord(request: ReservationGroupDraftUpdateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const slots = { ...existing.slots, ...(request.slots ?? {}) };
    const evidenceRefs = mergeEvidenceRefs(existing.evidenceRefs, request.evidenceRefs ?? []);
    const missingSlots = cloneValue(request.missingSlots ?? deriveGroupMissingSlots(slots));
    const status = existing.status === 'cancelled' ? 'cancelled' : groupDraftStatusFromMissingSlots(missingSlots, existing.expiresAt, updatedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs,
      quote: status === 'cancelled' ? existing.quote : undefined,
      pendingAction: status === 'cancelled' ? existing.pendingAction : undefined,
      updatedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, status === 'expired' ? 'expired' : 'updated', updatedAt, { request });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'updated', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected quoteReservationGroupDraftRecord(request: ReservationGroupQuoteApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);

    const quotedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationGroupDraftInactiveResponse(request, existing, quotedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationGroupDraftMissingSlotsResponse(request, existing);

    const quote = reservationGroupDraftQuote(existing, quotedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'quoteReady',
      quote,
      updatedAt: quotedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'quoted', quotedAt, { request, quoteRef: quote.quoteRef });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'quoted', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected prepareConfirmReservationGroupDraftRecord(request: ReservationGroupPrepareConfirmApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);

    const preparedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationGroupDraftInactiveResponse(request, existing, preparedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationGroupDraftMissingSlotsResponse(request, existing);
    if (!existing.quote) return reservationGroupDraftQuoteRequiredResponse(request, existing);
    if (request.quoteRef && request.quoteRef !== existing.quote.quoteRef) return reservationGroupDraftQuoteMismatchResponse(request, existing);

    const pendingAction = reservationGroupDraftPendingAction(existing, existing.quote.quoteRef, preparedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'awaitingConfirmation',
      pendingAction,
      updatedAt: preparedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'prepared', preparedAt, {
      request,
      pendingActionRef: pendingAction.pendingActionRef,
      cardPayloadRef: pendingAction.cardPayloadRef,
      selectionCount: pendingAction.selectionCount,
    });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'prepared', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected cancelReservationGroupDraftRecord(request: ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'cancelled',
      updatedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'cancelled', updatedAt, { request, reason: request.reason });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'cancelled', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected reservationGroupDraftReplayOrConflict(request: ReservationGroupDraftCreateApiRequest | ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return reservationGroupDraftTokenConflictResponse(request);
    }
    return cloneValue(existing.response) as ReservationGroupDraftWorkflowApiResponse;
  }

  protected readPendingActionRecord(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse {
    const replay = this.pendingActionReplayOrConflict(request);
    if (replay) return replay;

    const draft = this.getReservationDraftByPendingActionRef(request.pendingActionRef);
    if (draft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expirePendingActionIfNeeded(request, draft, requestedAt);
      if (expired) return expired;
      const auditRef = this.appendReservationDraftAudit(draft.draftId, 'pendingActionStatusRead', requestedAt, redactedPendingActionAuditPayload(request));
      const response = pendingActionSuccessResponse(request.operation ?? pmsPendingActionStatusOperation, 'statusRead', 'none', draft, [auditRef]);
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(request.pendingActionRef);
    if (groupDraft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expireGroupPendingActionIfNeeded(request, groupDraft, requestedAt);
      if (expired) return expired;
      const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'pendingActionStatusRead', requestedAt, redactedPendingActionAuditPayload(request));
      const response = pendingActionSuccessResponseFromGroup(request.operation ?? pmsPendingActionStatusOperation, 'statusRead', 'none', groupDraft, [auditRef]);
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    return pendingActionNotFoundResponse(request);
  }

  protected transitionPendingActionRecord(
    request: PendingActionConfirmApiRequest | PendingActionCancelApiRequest,
    transition: 'confirmed' | 'cancelled',
  ): PendingActionCallbackApiResponse {
    const replay = this.pendingActionReplayOrConflict(request);
    if (replay) return replay;

    const draft = this.getReservationDraftByPendingActionRef(request.pendingActionRef);
    const requestedAt = nonEmptyString(request.requestedAt, this.now());
    if (draft?.pendingAction) {
      const expired = this.expirePendingActionIfNeeded(request, draft, requestedAt);
      if (expired) return expired;
      if (request.cardPayloadRef && request.cardPayloadRef !== draft.pendingAction.cardPayloadRef) return pendingActionCardPayloadMismatchResponse(request, draft);
      if (draft.pendingAction.status !== 'awaitingConfirmation' || draft.status !== 'awaitingConfirmation') return pendingActionInactiveResponse(request, draft);
      if (transition === 'confirmed') {
        const rejection = this.reservationDraftMaterializationRejection(request, draft);
        if (rejection) return rejection;
      }

      const pendingAction: ReservationDraftPendingActionRef = {
        ...draft.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'committed' : 'none',
        updatedAt: requestedAt,
      };
      const updated: StoredReservationDraft = {
        ...draft,
        clientToken: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        status: transition === 'cancelled' ? 'cancelled' : draft.status,
        pendingAction,
        updatedAt: requestedAt,
      };
      this.saveReservationDraft(updated);
      const auditRef = this.appendReservationDraftAudit(
        updated.draftId,
        transition === 'confirmed' ? 'pendingActionConfirmed' : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const reservation = transition === 'confirmed'
        ? this.materializeConfirmedReservationDraft(updated, requestedAt)
        : undefined;
      const response = pendingActionSuccessResponse(
        request.operation ?? (transition === 'confirmed' ? pmsPendingActionConfirmOperation : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'committed' : 'none',
        updated,
        [auditRef],
        reservation,
      );
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(request.pendingActionRef);
    if (groupDraft?.pendingAction) {
      const expired = this.expireGroupPendingActionIfNeeded(request, groupDraft, requestedAt);
      if (expired) return expired;
      if (request.cardPayloadRef && request.cardPayloadRef !== groupDraft.pendingAction.cardPayloadRef) return pendingActionCardPayloadMismatchResponseFromGroup(request, groupDraft);
      if (groupDraft.pendingAction.status !== 'awaitingConfirmation' || groupDraft.status !== 'awaitingConfirmation') return pendingActionInactiveResponseFromGroup(request, groupDraft);

      const pendingAction: ReservationGroupDraftPendingActionRef = {
        ...groupDraft.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'deferred' : 'none',
        updatedAt: requestedAt,
      };
      const updated: StoredReservationGroupDraft = {
        ...groupDraft,
        clientToken: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        status: transition === 'cancelled' ? 'cancelled' : groupDraft.status,
        pendingAction,
        updatedAt: requestedAt,
      };
      this.saveReservationGroupDraft(updated);
      const auditRef = this.appendReservationGroupDraftAudit(
        updated.groupDraftId,
        transition === 'confirmed' ? 'pendingActionConfirmed' : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const response = pendingActionSuccessResponseFromGroup(
        request.operation ?? (transition === 'confirmed' ? pmsPendingActionConfirmOperation : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'deferred' : 'none',
        updated,
        [auditRef],
      );
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    return pendingActionNotFoundResponse(request);
  }

  protected pendingActionReplayOrConflict(request: PendingActionCallbackApiRequest): PendingActionCallbackApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint || !isPendingActionCallbackResponse(existing.response)) {
      return pendingActionTokenConflictResponse(request);
    }
    return cloneValue(existing.response);
  }

  protected reservationDraftMaterializationRejection(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
  ): PendingActionCallbackApiResponse | undefined {
    const slots = draft.slots;
    if (!slots.guestDisplayName || !slots.arrivalDate || !slots.departureDate || !slots.roomId) {
      return pendingActionRejectedResponse(request, draft, 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS', 'Reservation draft is missing slots required to create a final reservation.', 'slots');
    }
    const reservationId = reservationIdFromDraft(draft);
    const conflictingReservation = this.listReservationsByRoomIds(new Set([slots.roomId]))
      .find((reservation) =>
        reservation.reservationId !== reservationId &&
        reservation.status !== 'cancelled' &&
        reservation.status !== 'checkedOut' &&
        dateRangesOverlap(slots.arrivalDate!, slots.departureDate!, reservation.arrivalDate, reservation.departureDate)
      );
    if (conflictingReservation) {
      return pendingActionRejectedResponse(request, draft, 'RESERVATION_ROOM_UNAVAILABLE', 'Selected room is no longer available for this stay range.', 'roomId');
    }
    return undefined;
  }

  protected materializeConfirmedReservationDraft(draft: StoredReservationDraft, requestedAt: string): ReservationReadModel {
    const slots = draft.slots;
    const room = slots.roomId ? this.getRoom(slots.roomId) : undefined;
    const startDate = slots.arrivalDate ?? requestedAt.slice(0, 10);
    const endDate = slots.departureDate ?? addBusinessDays(startDate, 1);
    const reservationId = reservationIdFromDraft(draft);
    return this.saveReservationImportRecord({
      reservationId,
      reservationCode: reservationCodeFromDraft(draft),
      propertyId: draft.propertyId,
      roomId: slots.roomId,
      roomNumber: room?.roomNumber,
      roomTypeId: slots.roomTypeId ?? room?.roomTypeId,
      roomType: room?.roomType,
      guestDisplayName: slots.guestDisplayName ?? 'Guest',
      arrivalDate: startDate,
      departureDate: endDate,
      status: 'booked',
      allocation: {
        allocationId: `alloc-${reservationId}`,
        roomId: slots.roomId,
        roomNumber: room?.roomNumber,
        roomTypeId: slots.roomTypeId ?? room?.roomTypeId,
        roomType: room?.roomType,
        startDate,
        endDate,
        status: 'allocated',
      },
    });
  }

  protected expirePendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (!draft.pendingAction || draft.pendingAction.status !== 'awaitingConfirmation') return undefined;
    const expiresAt = draft.pendingAction.expiresAt ?? draft.expiresAt;
    if (expiresAt > requestedAt) return undefined;
    const pendingAction: ReservationDraftPendingActionRef = {
      ...draft.pendingAction,
      status: 'expired',
      mutationStatus: 'none',
      updatedAt: requestedAt,
    };
    const expired: StoredReservationDraft = {
      ...draft,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'expired',
      pendingAction,
      updatedAt: requestedAt,
    };
    this.saveReservationDraft(expired);
    const auditRef = this.appendReservationDraftAudit(expired.draftId, 'pendingActionExpired', requestedAt, redactedPendingActionAuditPayload(request));
    return pendingActionExpiredResponse(request, expired, [auditRef]);
  }

  protected expireGroupPendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationGroupDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (!draft.pendingAction || draft.pendingAction.status !== 'awaitingConfirmation') return undefined;
    const expiresAt = draft.pendingAction.expiresAt ?? draft.expiresAt;
    if (expiresAt > requestedAt) return undefined;
    const pendingAction: ReservationGroupDraftPendingActionRef = {
      ...draft.pendingAction,
      status: 'expired',
      mutationStatus: 'none',
      updatedAt: requestedAt,
    };
    const expired: StoredReservationGroupDraft = {
      ...draft,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'expired',
      pendingAction,
      updatedAt: requestedAt,
    };
    this.saveReservationGroupDraft(expired);
    const auditRef = this.appendReservationGroupDraftAudit(expired.groupDraftId, 'pendingActionExpired', requestedAt, redactedPendingActionAuditPayload(request));
    return pendingActionExpiredResponseFromGroup(request, expired, [auditRef]);
  }

















}

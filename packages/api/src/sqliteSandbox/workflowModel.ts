import { createHash } from 'node:crypto';
import {
  type AuditEntry,
  type DomainEvent,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryCalendarKind,
  type InventoryDayRoom,
  type InventoryIntervalProjection,
  type InventorySellableStatus,
  type InventorySourceRef,
  type InventorySummaryDayType,
  type OperationRequest,
  type ReservationDraftAuditRef,
  type ReservationDraftEvidenceRef,
  type ReservationDraftMissingSlot,
  type PendingActionReadModel,
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftStatus,
  type ReservationDraftWorkflowRef,
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftEvidenceRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftStatus,
  type ReservationGroupDraftWorkflowRef,
  type ReservationReadModel,
  type StayStatus,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsMaintenanceDoneOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestUpdateOperation,
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
  type OperationRequestCreateApiResponse,
  type OperationRequestUpdateApiResponse,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
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
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxStayReadback,
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchStatus,
  type PmsSandboxIdempotencyReadback,
} from '../localSandbox.js';

import { cloneValue } from './json.js';
import { addHoursIso } from './dates.js';
import { reservationDraftAuditId, reservationDraftDerivedRef, reservationDraftIdFromClientToken, reservationDraftRef, reservationGroupDraftAuditId, reservationGroupDraftIdFromClientToken, reservationGroupDraftRef, reservationGroupQuoteRef, reservationQuoteRef, stableRefHash } from './ids.js';
import { type StoredReservationDraft, type StoredReservationGroupDraft } from './rows.js';
export function reservationDraftRefFromStored(
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[] = [],
  options: { includeDraftId?: boolean } = {},
): ReservationDraftWorkflowRef {
  return {
    workflowType: 'reservation',
    draftRef: reservationDraftRef(draft.draftId),
    ...(options.includeDraftId ? { draftId: draft.draftId } : {}),
    status: draft.status,
    slots: cloneValue(draft.slots),
    missingSlots: cloneValue(draft.missingSlots),
    evidenceRefs: cloneValue(draft.evidenceRefs),
    expiresAt: draft.expiresAt,
    ...(draft.quote ? { quote: cloneValue(draft.quote) } : {}),
    ...(draft.pendingAction ? { pendingAction: cloneValue(draft.pendingAction) } : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function reservationGroupDraftRefFromStored(
  draft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[] = [],
  options: { includeGroupDraftId?: boolean } = {},
): ReservationGroupDraftWorkflowRef {
  return {
    workflowType: 'reservationGroup',
    groupDraftRef: reservationGroupDraftRef(draft.groupDraftId),
    ...(options.includeGroupDraftId ? { groupDraftId: draft.groupDraftId } : {}),
    status: draft.status,
    slots: cloneValue(draft.slots),
    missingSlots: cloneValue(draft.missingSlots),
    evidenceRefs: cloneValue(draft.evidenceRefs),
    expiresAt: draft.expiresAt,
    ...(draft.quote ? { quote: cloneValue(draft.quote) } : {}),
    ...(draft.pendingAction ? { pendingAction: cloneValue(draft.pendingAction) } : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function reservationDraftSuccessResponse(
  operation: typeof pmsReservationDraftCreateOperation | typeof pmsReservationDraftUpdateOperation | typeof pmsReservationQuoteOperation | typeof pmsReservationPrepareConfirmOperation | typeof pmsReservationDraftCancelOperation,
  idempotencyStatus: 'created' | 'updated' | 'quoted' | 'prepared' | 'cancelled',
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[],
): ReservationDraftWorkflowApiResponse {
  return {
    ok: true,
    operation,
    status: 'ok',
    mutationStatus: 'draftOnly',
    idempotencyStatus,
    draft: reservationDraftRefFromStored(draft, auditRefs),
  };
}

export function reservationGroupDraftSuccessResponse(
  operation: typeof pmsReservationGroupDraftCreateOperation | typeof pmsReservationGroupDraftUpdateOperation | typeof pmsReservationGroupQuoteOperation | typeof pmsReservationGroupPrepareConfirmOperation | typeof pmsReservationGroupDraftCancelOperation,
  idempotencyStatus: 'created' | 'updated' | 'quoted' | 'prepared' | 'cancelled',
  groupDraft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[],
): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: true,
    operation,
    status: 'ok',
    mutationStatus: 'draftOnly',
    idempotencyStatus,
    groupDraft: reservationGroupDraftRefFromStored(groupDraft, auditRefs),
  };
}

export function reservationDraftTokenConflictResponse(
  request: ReservationDraftCreateApiRequest | ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest,
): ReservationDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{
      code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
      message: 'The reservation draft client token was reused with a different request fingerprint.',
      field: 'requestFingerprint',
    }],
  };
}

export function reservationDraftNotFoundResponse(request: ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest): ReservationDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'notFound',
    mutationStatus: 'none',
    errors: [{ code: 'RESERVATION_DRAFT_NOT_FOUND', message: 'Reservation draft was not found.', field: 'draftRef' }],
  };
}

export function reservationDraftInactiveResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
  requestedAt: string,
): ReservationDraftWorkflowApiResponse | undefined {
  if (draft.status === 'cancelled') {
    return reservationDraftRejectedResponse(request, draft, 'RESERVATION_DRAFT_NOT_ACTIVE', 'Reservation draft is cancelled and cannot be quoted or prepared.', 'status');
  }
  if (draft.status === 'expired' || draft.expiresAt <= requestedAt) {
    return reservationDraftRejectedResponse(request, { ...draft, status: 'expired' }, 'RESERVATION_DRAFT_EXPIRED', 'Reservation draft is expired and cannot be quoted or prepared.', 'expiresAt');
  }
  return undefined;
}

export function reservationDraftMissingSlotsResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(request, draft, 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS', 'Reservation draft is missing required slots.', 'missingSlots');
}

export function reservationDraftQuoteRequiredResponse(
  request: ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(request, draft, 'RESERVATION_DRAFT_QUOTE_REQUIRED', 'Reservation draft must be quoted before prepareConfirm can create pending-action refs.', 'quoteRef');
}

export function reservationDraftQuoteMismatchResponse(
  request: ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(request, draft, 'RESERVATION_DRAFT_QUOTE_MISMATCH', 'Reservation prepareConfirm quoteRef does not match the draft quote.', 'quoteRef');
}

export function reservationDraftRejectedResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
  code: 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS' | 'RESERVATION_DRAFT_NOT_ACTIVE' | 'RESERVATION_DRAFT_EXPIRED' | 'RESERVATION_DRAFT_QUOTE_REQUIRED' | 'RESERVATION_DRAFT_QUOTE_MISMATCH',
  message: string,
  field: string,
): ReservationDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    draft: reservationDraftRefFromStored(draft),
    errors: [{ code, message, field }],
  };
}

export function reservationGroupDraftTokenConflictResponse(
  request: ReservationGroupDraftCreateApiRequest | ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest,
): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{
      code: 'RESERVATION_GROUP_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
      message: 'The reservation group draft client token was reused with a different request fingerprint.',
      field: 'requestFingerprint',
    }],
  };
}

export function reservationGroupDraftNotFoundResponse(request: ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'notFound',
    mutationStatus: 'none',
    errors: [{ code: 'RESERVATION_GROUP_DRAFT_NOT_FOUND', message: 'Reservation group draft was not found.', field: 'groupDraftRef' }],
  };
}

export function reservationGroupDraftInactiveResponse(
  request: ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
  requestedAt: string,
): ReservationGroupDraftWorkflowApiResponse | undefined {
  if (draft.status === 'cancelled') {
    return reservationGroupDraftRejectedResponse(request, draft, 'RESERVATION_GROUP_DRAFT_NOT_ACTIVE', 'Reservation group draft is cancelled and cannot be quoted or prepared.', 'status');
  }
  if (draft.status === 'expired' || draft.expiresAt <= requestedAt) {
    return reservationGroupDraftRejectedResponse(request, { ...draft, status: 'expired' }, 'RESERVATION_GROUP_DRAFT_EXPIRED', 'Reservation group draft is expired and cannot be quoted or prepared.', 'expiresAt');
  }
  return undefined;
}

export function reservationGroupDraftMissingSlotsResponse(
  request: ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(request, draft, 'RESERVATION_GROUP_DRAFT_MISSING_REQUIRED_SLOTS', 'Reservation group draft is missing required slots.', 'missingSlots');
}

export function reservationGroupDraftQuoteRequiredResponse(
  request: ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(request, draft, 'RESERVATION_GROUP_DRAFT_QUOTE_REQUIRED', 'Reservation group draft must be quoted before prepareConfirm can create pending-action refs.', 'quoteRef');
}

export function reservationGroupDraftQuoteMismatchResponse(
  request: ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(request, draft, 'RESERVATION_GROUP_DRAFT_QUOTE_MISMATCH', 'Reservation group prepareConfirm quoteRef does not match the group draft quote.', 'quoteRef');
}

export function reservationGroupDraftRejectedResponse(
  request: ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
  code: 'RESERVATION_GROUP_DRAFT_MISSING_REQUIRED_SLOTS' | 'RESERVATION_GROUP_DRAFT_NOT_ACTIVE' | 'RESERVATION_GROUP_DRAFT_EXPIRED' | 'RESERVATION_GROUP_DRAFT_QUOTE_REQUIRED' | 'RESERVATION_GROUP_DRAFT_QUOTE_MISMATCH',
  message: string,
  field: string,
): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    groupDraft: reservationGroupDraftRefFromStored(draft),
    errors: [{ code, message, field }],
  };
}

export function deriveGroupMissingSlots(slots: ReservationGroupDraftSlots): readonly ReservationGroupDraftMissingSlot[] {
  const missing: ReservationGroupDraftMissingSlot[] = [];
  if (!slots.guestDisplayName) missing.push('guest');
  if (!slots.arrivalDate || !slots.departureDate) missing.push('stayDates');
  if (!slots.quantity || slots.quantity < 1) missing.push('quantity');
  if (!hasCompleteGroupSelections(slots)) missing.push('roomSelections');
  return missing;
}

export function hasCompleteGroupSelections(slots: ReservationGroupDraftSlots): boolean {
  if (!slots.quantity || slots.quantity < 1) return false;
  if (!slots.selections || slots.selections.length !== slots.quantity) return false;
  const roomIds = new Set<string>();
  for (const selection of slots.selections) {
    if (!selection.roomId || !selection.selectedCandidateRef) return false;
    roomIds.add(selection.roomId);
  }
  return roomIds.size === slots.quantity;
}

export function groupDraftStatusFromMissingSlots(
  missingSlots: readonly ReservationGroupDraftMissingSlot[],
  expiresAt: string,
  requestedAt: string,
): ReservationGroupDraftStatus {
  if (expiresAt <= requestedAt) return 'expired';
  return missingSlots.length > 0 ? 'collectingSlots' : 'quoteReady';
}

export function deriveMissingSlots(slots: ReservationDraftSlots): readonly ReservationDraftMissingSlot[] {
  const missing: ReservationDraftMissingSlot[] = [];
  if (!slots.guestDisplayName) missing.push('guest');
  if (!slots.arrivalDate || !slots.departureDate) missing.push('stayDates');
  if (!slots.roomTypeId && !slots.roomTypeKeyword && !slots.roomId) missing.push('roomType');
  if (!slots.roomId && !slots.selectedCandidateRef) missing.push('candidateSelection');
  return missing;
}

export function draftStatusFromMissingSlots(
  missingSlots: readonly ReservationDraftMissingSlot[],
  expiresAt: string,
  requestedAt: string,
): ReservationDraftStatus {
  if (expiresAt <= requestedAt) return 'expired';
  return missingSlots.length > 0 ? 'collectingSlots' : 'quoteReady';
}

export function mergeEvidenceRefs(
  existing: readonly ReservationDraftEvidenceRef[],
  next: readonly ReservationDraftEvidenceRef[],
): readonly ReservationDraftEvidenceRef[] {
  const byKey = new Map<string, ReservationDraftEvidenceRef>();
  for (const ref of [...existing, ...next]) {
    byKey.set(`${ref.source}:${ref.refId}`, ref);
  }
  return Array.from(byKey.values());
}

export function reservationGroupDraftQuote(draft: StoredReservationGroupDraft, generatedAt: string): ReservationGroupDraftQuoteRef {
  return {
    quoteRef: reservationGroupQuoteRef(draft),
    status: 'pricingUnsupported',
    generatedAt,
    capabilityGap: {
      code: 'RESERVATION_GROUP_QUOTE_PRICING_UNSUPPORTED',
      owner: 'pms-platform',
      message: 'Reservation group pricing/rate truth is not available in the local platform sandbox; no price was invented.',
    },
  };
}

export function reservationGroupDraftPendingAction(draft: StoredReservationGroupDraft, quoteRef: string, generatedAt: string): ReservationGroupDraftPendingActionRef {
  return {
    pendingActionRef: reservationDraftDerivedRef('pending-action', `${draft.groupDraftId}:${quoteRef}`),
    cardPayloadRef: reservationDraftDerivedRef('card-payload', `${draft.groupDraftId}:${quoteRef}`),
    quoteRef,
    generatedAt,
    updatedAt: generatedAt,
    expiresAt: draft.expiresAt,
    status: 'awaitingConfirmation',
    confirmationMode: 'typedCardOnly',
    mutationStatus: 'none',
    selectionCount: draft.slots.selections?.length ?? 0,
  };
}

export function reservationDraftQuote(draft: StoredReservationDraft, generatedAt: string): ReservationDraftQuoteRef {
  return {
    quoteRef: reservationQuoteRef(draft),
    status: 'pricingUnsupported',
    generatedAt,
    capabilityGap: {
      code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED',
      owner: 'pms-platform',
      message: 'Reservation draft pricing/rate truth is not available in the local platform sandbox; no price was invented.',
    },
  };
}

export function reservationDraftPendingAction(draft: StoredReservationDraft, quoteRef: string, generatedAt: string): ReservationDraftPendingActionRef {
  return {
    pendingActionRef: reservationDraftDerivedRef('pending-action', `${draft.draftId}:${quoteRef}`),
    cardPayloadRef: reservationDraftDerivedRef('card-payload', `${draft.draftId}:${quoteRef}`),
    quoteRef,
    generatedAt,
    updatedAt: generatedAt,
    expiresAt: draft.expiresAt,
    status: 'awaitingConfirmation',
    confirmationMode: 'typedCardOnly',
    mutationStatus: 'none',
  };
}

export function pendingActionReadModelFromDraft(draft: StoredReservationDraft, auditRefs: readonly ReservationDraftAuditRef[] = []): PendingActionReadModel {
  const pendingAction = draft.pendingAction!;
  return {
    pendingActionRef: pendingAction.pendingActionRef,
    workflowType: 'reservation',
    quoteRef: pendingAction.quoteRef,
    cardPayloadRef: pendingAction.cardPayloadRef,
    status: pendingAction.status,
    confirmationMode: pendingAction.confirmationMode,
    mutationStatus: pendingAction.mutationStatus,
    generatedAt: pendingAction.generatedAt,
    updatedAt: pendingAction.updatedAt,
    ...(pendingAction.expiresAt ? { expiresAt: pendingAction.expiresAt } : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function pendingActionReadModelFromGroupDraft(draft: StoredReservationGroupDraft, auditRefs: readonly ReservationGroupDraftAuditRef[] = []): PendingActionReadModel {
  const pendingAction = draft.pendingAction!;
  return {
    pendingActionRef: pendingAction.pendingActionRef,
    workflowType: 'reservationGroup',
    quoteRef: pendingAction.quoteRef,
    cardPayloadRef: pendingAction.cardPayloadRef,
    status: pendingAction.status,
    confirmationMode: pendingAction.confirmationMode,
    mutationStatus: pendingAction.mutationStatus,
    generatedAt: pendingAction.generatedAt,
    updatedAt: pendingAction.updatedAt,
    ...(pendingAction.expiresAt ? { expiresAt: pendingAction.expiresAt } : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function pendingActionSuccessResponse(
  operation: typeof pmsPendingActionStatusOperation | typeof pmsPendingActionConfirmOperation | typeof pmsPendingActionCancelOperation,
  idempotencyStatus: 'statusRead' | 'confirmed' | 'cancelled',
  mutationStatus: 'none' | 'deferred' | 'committed',
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[],
  reservation?: ReservationReadModel,
): PendingActionCallbackApiResponse {
  return {
    ok: true,
    operation,
    status: 'ok',
    mutationStatus,
    idempotencyStatus,
    pendingAction: pendingActionReadModelFromDraft(draft, auditRefs),
    ...(reservation ? { reservation: cloneValue(reservation) } : {}),
  };
}

export function pendingActionSuccessResponseFromGroup(
  operation: typeof pmsPendingActionStatusOperation | typeof pmsPendingActionConfirmOperation | typeof pmsPendingActionCancelOperation,
  idempotencyStatus: 'statusRead' | 'confirmed' | 'cancelled',
  mutationStatus: 'none' | 'deferred',
  draft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[],
): PendingActionCallbackApiResponse {
  return {
    ok: true,
    operation,
    status: 'ok',
    mutationStatus,
    idempotencyStatus,
    pendingAction: pendingActionReadModelFromGroupDraft(draft, auditRefs),
  };
}

export function pendingActionRejectedResponse(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationDraft,
  code: ApiErrorCode,
  message: string,
  field: string,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft),
    errors: [{ code, message, field }],
  };
}

export function pendingActionTokenConflictResponse(request: PendingActionCallbackApiRequest): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{
      code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
      message: 'The pending action client token was reused with a different request fingerprint.',
      field: 'requestFingerprint',
    }],
  };
}

export function pendingActionNotFoundResponse(request: PendingActionCallbackApiRequest): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'notFound',
    mutationStatus: 'none',
    errors: [{ code: 'PENDING_ACTION_NOT_FOUND', message: 'Pending action was not found.', field: 'pendingActionRef' }],
  };
}

export function pendingActionCardPayloadMismatchResponse(request: PendingActionCallbackApiRequest, draft: StoredReservationDraft): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft),
    errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH', message: 'Card payload ref does not match the pending action.', field: 'cardPayloadRef' }],
  };
}

export function pendingActionCardPayloadMismatchResponseFromGroup(request: PendingActionCallbackApiRequest, draft: StoredReservationGroupDraft): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft),
    errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH', message: 'Card payload ref does not match the pending action.', field: 'cardPayloadRef' }],
  };
}

export function pendingActionInactiveResponse(request: PendingActionCallbackApiRequest, draft: StoredReservationDraft): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft),
    errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE', message: 'Pending action is no longer awaiting typed-card confirmation.', field: 'status' }],
  };
}

export function pendingActionInactiveResponseFromGroup(request: PendingActionCallbackApiRequest, draft: StoredReservationGroupDraft): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft),
    errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE', message: 'Pending action is no longer awaiting typed-card confirmation.', field: 'status' }],
  };
}

export function pendingActionExpiredResponse(request: PendingActionCallbackApiRequest, draft: StoredReservationDraft, auditRefs: readonly ReservationDraftAuditRef[]): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft, auditRefs),
    errors: [{ code: 'PENDING_ACTION_EXPIRED', message: 'Pending action is expired and cannot be confirmed or cancelled.', field: 'expiresAt' }],
  };
}

export function pendingActionExpiredResponseFromGroup(request: PendingActionCallbackApiRequest, draft: StoredReservationGroupDraft, auditRefs: readonly ReservationGroupDraftAuditRef[]): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft, auditRefs),
    errors: [{ code: 'PENDING_ACTION_EXPIRED', message: 'Pending action is expired and cannot be confirmed or cancelled.', field: 'expiresAt' }],
  };
}

export function isPendingActionCallbackResponse(response: ApiIdempotencyRecord['response']): response is PendingActionCallbackApiResponse {
  return 'operation' in response && (
    response.operation === pmsPendingActionStatusOperation ||
    response.operation === pmsPendingActionConfirmOperation ||
    response.operation === pmsPendingActionCancelOperation
  );
}

export function pendingActionFallbackOperation(request: PendingActionCallbackApiRequest): typeof pmsPendingActionStatusOperation | typeof pmsPendingActionConfirmOperation | typeof pmsPendingActionCancelOperation {
  return request.operation ?? ('reason' in request ? pmsPendingActionCancelOperation : pmsPendingActionStatusOperation);
}

export function redactedPendingActionAuditPayload(request: PendingActionCallbackApiRequest): Record<string, unknown> {
  return {
    operation: request.operation ?? pendingActionFallbackOperation(request),
    pendingActionRef: request.pendingActionRef,
    cardPayloadRef: request.cardPayloadRef,
    actor: { type: request.actor.type, id: stableRefHash(request.actor.id) },
    scope: {
      propertyId: request.scope.propertyId,
      channel: request.scope.channel,
      ...(request.scope.tenantIdHash ? { tenantIdHash: request.scope.tenantIdHash } : {}),
      ...(request.scope.chatIdHash ? { chatIdHash: request.scope.chatIdHash } : {}),
      ...(request.scope.userIdHash ? { userIdHash: request.scope.userIdHash } : {}),
    },
    correlationId: request.correlationId,
    requestedAt: request.requestedAt,
    clientTokenHash: stableRefHash(request.clientToken),
    requestFingerprint: request.requestFingerprint,
  };
}

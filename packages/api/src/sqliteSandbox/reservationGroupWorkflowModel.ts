import {
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftStatus,
} from '@pms-platform/contracts';
import {
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  type ReservationGroupDraftCancelApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationGroupDraftUpdateApiRequest,
  type ReservationGroupDraftWorkflowApiResponse,
  type ReservationGroupPrepareConfirmApiRequest,
  type ReservationGroupQuoteApiRequest,
} from '../index.js';

import { reservationDraftDerivedRef, reservationGroupQuoteRef } from './ids.js';
import { type StoredReservationGroupDraft } from './rows.js';
import { reservationGroupDraftRefFromStored } from './workflowRefsModel.js';

export function reservationGroupDraftSuccessResponse(
  operation:
    | typeof pmsReservationGroupDraftCreateOperation
    | typeof pmsReservationGroupDraftUpdateOperation
    | typeof pmsReservationGroupQuoteOperation
    | typeof pmsReservationGroupPrepareConfirmOperation
    | typeof pmsReservationGroupDraftCancelOperation,
  idempotencyStatus:
    | 'created'
    | 'updated'
    | 'quoted'
    | 'prepared'
    | 'cancelled',
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

export function reservationGroupDraftTokenConflictResponse(
  request:
    | ReservationGroupDraftCreateApiRequest
    | ReservationGroupDraftUpdateApiRequest
    | ReservationGroupQuoteApiRequest
    | ReservationGroupPrepareConfirmApiRequest
    | ReservationGroupDraftCancelApiRequest,
): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [
      {
        code: 'RESERVATION_GROUP_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        message:
          'The reservation group draft client token was reused with a different request fingerprint.',
        field: 'requestFingerprint',
      },
    ],
  };
}

export function reservationGroupDraftNotFoundResponse(
  request:
    | ReservationGroupDraftUpdateApiRequest
    | ReservationGroupQuoteApiRequest
    | ReservationGroupPrepareConfirmApiRequest
    | ReservationGroupDraftCancelApiRequest,
): ReservationGroupDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'notFound',
    mutationStatus: 'none',
    errors: [
      {
        code: 'RESERVATION_GROUP_DRAFT_NOT_FOUND',
        message: 'Reservation group draft was not found.',
        field: 'groupDraftRef',
      },
    ],
  };
}

export function reservationGroupDraftInactiveResponse(
  request:
    | ReservationGroupQuoteApiRequest
    | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
  requestedAt: string,
): ReservationGroupDraftWorkflowApiResponse | undefined {
  if (draft.status === 'cancelled') {
    return reservationGroupDraftRejectedResponse(
      request,
      draft,
      'RESERVATION_GROUP_DRAFT_NOT_ACTIVE',
      'Reservation group draft is cancelled and cannot be quoted or prepared.',
      'status',
    );
  }
  if (draft.status === 'expired' || draft.expiresAt <= requestedAt) {
    return reservationGroupDraftRejectedResponse(
      request,
      { ...draft, status: 'expired' },
      'RESERVATION_GROUP_DRAFT_EXPIRED',
      'Reservation group draft is expired and cannot be quoted or prepared.',
      'expiresAt',
    );
  }
  return undefined;
}

export function reservationGroupDraftMissingSlotsResponse(
  request:
    | ReservationGroupQuoteApiRequest
    | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_GROUP_DRAFT_MISSING_REQUIRED_SLOTS',
    'Reservation group draft is missing required slots.',
    'missingSlots',
  );
}

export function reservationGroupDraftQuoteRequiredResponse(
  request: ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_GROUP_DRAFT_QUOTE_REQUIRED',
    'Reservation group draft must be quoted before prepareConfirm can create pending-action refs.',
    'quoteRef',
  );
}

export function reservationGroupDraftQuoteMismatchResponse(
  request: ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
): ReservationGroupDraftWorkflowApiResponse {
  return reservationGroupDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_GROUP_DRAFT_QUOTE_MISMATCH',
    'Reservation group prepareConfirm quoteRef does not match the group draft quote.',
    'quoteRef',
  );
}

export function reservationGroupDraftRejectedResponse(
  request:
    | ReservationGroupQuoteApiRequest
    | ReservationGroupPrepareConfirmApiRequest,
  draft: StoredReservationGroupDraft,
  code:
    | 'RESERVATION_GROUP_DRAFT_MISSING_REQUIRED_SLOTS'
    | 'RESERVATION_GROUP_DRAFT_NOT_ACTIVE'
    | 'RESERVATION_GROUP_DRAFT_EXPIRED'
    | 'RESERVATION_GROUP_DRAFT_QUOTE_REQUIRED'
    | 'RESERVATION_GROUP_DRAFT_QUOTE_MISMATCH',
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

export function deriveGroupMissingSlots(
  slots: ReservationGroupDraftSlots,
): readonly ReservationGroupDraftMissingSlot[] {
  const missing: ReservationGroupDraftMissingSlot[] = [];
  if (!slots.guestDisplayName) missing.push('guest');
  if (!slots.arrivalDate || !slots.departureDate) missing.push('stayDates');
  if (!slots.quantity || slots.quantity < 1) missing.push('quantity');
  if (!hasCompleteGroupSelections(slots)) missing.push('roomSelections');
  return missing;
}

export function hasCompleteGroupSelections(
  slots: ReservationGroupDraftSlots,
): boolean {
  if (!slots.quantity || slots.quantity < 1) return false;
  if (!slots.selections || slots.selections.length !== slots.quantity)
    return false;
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

export function reservationGroupDraftQuote(
  draft: StoredReservationGroupDraft,
  generatedAt: string,
): ReservationGroupDraftQuoteRef {
  return {
    quoteRef: reservationGroupQuoteRef(draft),
    status: 'pricingUnsupported',
    generatedAt,
    capabilityGap: {
      code: 'RESERVATION_GROUP_QUOTE_PRICING_UNSUPPORTED',
      owner: 'pms-platform',
      message:
        'Reservation group pricing/rate truth is not available in the local platform sandbox; no price was invented.',
    },
  };
}

export function reservationGroupDraftPendingAction(
  draft: StoredReservationGroupDraft,
  quoteRef: string,
  generatedAt: string,
): ReservationGroupDraftPendingActionRef {
  return {
    pendingActionRef: reservationDraftDerivedRef(
      'pending-action',
      `${draft.groupDraftId}:${quoteRef}`,
    ),
    cardPayloadRef: reservationDraftDerivedRef(
      'card-payload',
      `${draft.groupDraftId}:${quoteRef}`,
    ),
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

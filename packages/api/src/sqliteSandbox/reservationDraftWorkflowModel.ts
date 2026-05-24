import {
  type ReservationDraftAuditRef,
  type ReservationDraftMissingSlot,
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftStatus,
} from '@pms-platform/contracts';
import {
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationDraftWorkflowApiResponse,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
} from '../index.js';

import { reservationDraftDerivedRef, reservationQuoteRef } from './ids.js';
import { type StoredReservationDraft } from './rows.js';
import { reservationDraftRefFromStored } from './workflowRefsModel.js';

export function reservationDraftSuccessResponse(
  operation:
    | typeof pmsReservationDraftCreateOperation
    | typeof pmsReservationDraftUpdateOperation
    | typeof pmsReservationQuoteOperation
    | typeof pmsReservationPrepareConfirmOperation
    | typeof pmsReservationDraftCancelOperation,
  idempotencyStatus:
    | 'created'
    | 'updated'
    | 'quoted'
    | 'prepared'
    | 'cancelled',
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

export function reservationDraftTokenConflictResponse(
  request:
    | ReservationDraftCreateApiRequest
    | ReservationDraftUpdateApiRequest
    | ReservationQuoteApiRequest
    | ReservationPrepareConfirmApiRequest
    | ReservationDraftCancelApiRequest,
): ReservationDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [
      {
        code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        message:
          'The reservation draft client token was reused with a different request fingerprint.',
        field: 'requestFingerprint',
      },
    ],
  };
}

export function reservationDraftNotFoundResponse(
  request:
    | ReservationDraftUpdateApiRequest
    | ReservationQuoteApiRequest
    | ReservationPrepareConfirmApiRequest
    | ReservationDraftCancelApiRequest,
): ReservationDraftWorkflowApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: 'notFound',
    mutationStatus: 'none',
    errors: [
      {
        code: 'RESERVATION_DRAFT_NOT_FOUND',
        message: 'Reservation draft was not found.',
        field: 'draftRef',
      },
    ],
  };
}

export function reservationDraftInactiveResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
  requestedAt: string,
): ReservationDraftWorkflowApiResponse | undefined {
  if (draft.status === 'cancelled') {
    return reservationDraftRejectedResponse(
      request,
      draft,
      'RESERVATION_DRAFT_NOT_ACTIVE',
      'Reservation draft is cancelled and cannot be quoted or prepared.',
      'status',
    );
  }
  if (draft.status === 'expired' || draft.expiresAt <= requestedAt) {
    return reservationDraftRejectedResponse(
      request,
      { ...draft, status: 'expired' },
      'RESERVATION_DRAFT_EXPIRED',
      'Reservation draft is expired and cannot be quoted or prepared.',
      'expiresAt',
    );
  }
  return undefined;
}

export function reservationDraftMissingSlotsResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS',
    'Reservation draft is missing required slots.',
    'missingSlots',
  );
}

export function reservationDraftQuoteRequiredResponse(
  request: ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_DRAFT_QUOTE_REQUIRED',
    'Reservation draft must be quoted before prepareConfirm can create pending-action refs.',
    'quoteRef',
  );
}

export function reservationDraftQuoteMismatchResponse(
  request: ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
): ReservationDraftWorkflowApiResponse {
  return reservationDraftRejectedResponse(
    request,
    draft,
    'RESERVATION_DRAFT_QUOTE_MISMATCH',
    'Reservation prepareConfirm quoteRef does not match the draft quote.',
    'quoteRef',
  );
}

export function reservationDraftRejectedResponse(
  request: ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest,
  draft: StoredReservationDraft,
  code:
    | 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS'
    | 'RESERVATION_DRAFT_NOT_ACTIVE'
    | 'RESERVATION_DRAFT_EXPIRED'
    | 'RESERVATION_DRAFT_QUOTE_REQUIRED'
    | 'RESERVATION_DRAFT_QUOTE_MISMATCH',
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

export function deriveMissingSlots(
  slots: ReservationDraftSlots,
): readonly ReservationDraftMissingSlot[] {
  const missing: ReservationDraftMissingSlot[] = [];
  if (!slots.guestDisplayName) missing.push('guest');
  if (!slots.arrivalDate || !slots.departureDate) missing.push('stayDates');
  if (!slots.roomTypeId && !slots.roomTypeKeyword && !slots.roomId)
    missing.push('roomType');
  if (!slots.roomId && !slots.selectedCandidateRef)
    missing.push('candidateSelection');
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

export function reservationDraftQuote(
  draft: StoredReservationDraft,
  generatedAt: string,
): ReservationDraftQuoteRef {
  return {
    quoteRef: reservationQuoteRef(draft),
    status: 'pricingUnsupported',
    generatedAt,
    capabilityGap: {
      code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED',
      owner: 'pms-platform',
      message:
        'Reservation draft pricing/rate truth is not available in the local platform sandbox; no price was invented.',
    },
  };
}

export function reservationDraftPendingAction(
  draft: StoredReservationDraft,
  quoteRef: string,
  generatedAt: string,
): ReservationDraftPendingActionRef {
  return {
    pendingActionRef: reservationDraftDerivedRef(
      'pending-action',
      `${draft.draftId}:${quoteRef}`,
    ),
    cardPayloadRef: reservationDraftDerivedRef(
      'card-payload',
      `${draft.draftId}:${quoteRef}`,
    ),
    quoteRef,
    generatedAt,
    updatedAt: generatedAt,
    expiresAt: draft.expiresAt,
    status: 'awaitingConfirmation',
    confirmationMode: 'typedCardOnly',
    mutationStatus: 'none',
    // Display-only echo of the draft slots for the confirmation card.
    ...(draft.slots.guestDisplayName ? { guestName: draft.slots.guestDisplayName } : {}),
    ...(draft.slots.roomTypeKeyword ? { roomType: draft.slots.roomTypeKeyword } : {}),
    ...(draft.slots.arrivalDate ? { checkInDate: draft.slots.arrivalDate } : {}),
    ...(draft.slots.departureDate ? { checkOutDate: draft.slots.departureDate } : {}),
  };
}

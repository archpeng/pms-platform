import {
  type PendingActionReadModel,
  type ReservationDraftAuditRef,
  type ReservationGroupDraftAuditRef,
  type ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
} from '../index.js';

import { cloneValue } from './json.js';
import {
  type StoredReservationDraft,
  type StoredReservationGroupDraft,
} from './rows.js';
import { pendingActionFallbackOperation } from './workflowSharedModel.js';

export function pendingActionReadModelFromDraft(
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[] = [],
): PendingActionReadModel {
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

export function pendingActionReadModelFromGroupDraft(
  draft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[] = [],
): PendingActionReadModel {
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
  operation:
    | typeof pmsPendingActionStatusOperation
    | typeof pmsPendingActionConfirmOperation
    | typeof pmsPendingActionCancelOperation,
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
  operation:
    | typeof pmsPendingActionStatusOperation
    | typeof pmsPendingActionConfirmOperation
    | typeof pmsPendingActionCancelOperation,
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

export function pendingActionTokenConflictResponse(
  request: PendingActionCallbackApiRequest,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    errors: [
      {
        code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        message:
          'The pending action client token was reused with a different request fingerprint.',
        field: 'requestFingerprint',
      },
    ],
  };
}

export function pendingActionNotFoundResponse(
  request: PendingActionCallbackApiRequest,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'notFound',
    mutationStatus: 'none',
    errors: [
      {
        code: 'PENDING_ACTION_NOT_FOUND',
        message: 'Pending action was not found.',
        field: 'pendingActionRef',
      },
    ],
  };
}

export function pendingActionCardPayloadMismatchResponse(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationDraft,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft),
    errors: [
      {
        code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH',
        message: 'Card payload ref does not match the pending action.',
        field: 'cardPayloadRef',
      },
    ],
  };
}

export function pendingActionCardPayloadMismatchResponseFromGroup(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationGroupDraft,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft),
    errors: [
      {
        code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH',
        message: 'Card payload ref does not match the pending action.',
        field: 'cardPayloadRef',
      },
    ],
  };
}

export function pendingActionInactiveResponse(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationDraft,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft),
    errors: [
      {
        code: 'PENDING_ACTION_NOT_ACTIVE',
        message:
          'Pending action is no longer awaiting typed-card confirmation.',
        field: 'status',
      },
    ],
  };
}

export function pendingActionInactiveResponseFromGroup(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationGroupDraft,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft),
    errors: [
      {
        code: 'PENDING_ACTION_NOT_ACTIVE',
        message:
          'Pending action is no longer awaiting typed-card confirmation.',
        field: 'status',
      },
    ],
  };
}

export function pendingActionExpiredResponse(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationDraft,
  auditRefs: readonly ReservationDraftAuditRef[],
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromDraft(draft, auditRefs),
    errors: [
      {
        code: 'PENDING_ACTION_EXPIRED',
        message:
          'Pending action is expired and cannot be confirmed or cancelled.',
        field: 'expiresAt',
      },
    ],
  };
}

export function pendingActionExpiredResponseFromGroup(
  request: PendingActionCallbackApiRequest,
  draft: StoredReservationGroupDraft,
  auditRefs: readonly ReservationGroupDraftAuditRef[],
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromGroupDraft(draft, auditRefs),
    errors: [
      {
        code: 'PENDING_ACTION_EXPIRED',
        message:
          'Pending action is expired and cannot be confirmed or cancelled.',
        field: 'expiresAt',
      },
    ],
  };
}

export function isPendingActionCallbackResponse(
  response: ApiIdempotencyRecord['response'],
): response is PendingActionCallbackApiResponse {
  return (
    'operation' in response &&
    (response.operation === pmsPendingActionStatusOperation ||
      response.operation === pmsPendingActionConfirmOperation ||
      response.operation === pmsPendingActionCancelOperation)
  );
}

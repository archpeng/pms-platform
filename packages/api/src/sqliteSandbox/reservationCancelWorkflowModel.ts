import type {
  PendingActionReadModel,
  ReservationDraftAuditRef,
  ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReservationCancelPrepareOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
  type ReservationCancelPrepareApiRequest,
  type ReservationCancelPrepareApiResponse,
} from '../index.js';
import { cloneValue } from './json.js';
import { type StoredReservationCancelAction } from './rows.js';
import { pendingActionFallbackOperation } from './workflowSharedModel.js';

export function pendingActionReadModelFromCancelAction(
  action: StoredReservationCancelAction,
  auditRefs: readonly ReservationDraftAuditRef[] = [],
): PendingActionReadModel {
  return {
    pendingActionRef: action.pendingAction.pendingActionRef,
    workflowType: 'reservationCancel',
    reservationId: action.pendingAction.reservationId,
    reservationCode: action.pendingAction.reservationCode,
    cardPayloadRef: action.pendingAction.cardPayloadRef,
    status: action.pendingAction.status,
    confirmationMode: action.pendingAction.confirmationMode,
    mutationStatus: action.pendingAction.mutationStatus,
    generatedAt: action.pendingAction.generatedAt,
    updatedAt: action.pendingAction.updatedAt,
    ...(action.pendingAction.expiresAt ? { expiresAt: action.pendingAction.expiresAt } : {}),
    ...(auditRefs.length > 0 ? { auditRefs: cloneValue(auditRefs) } : {}),
  };
}

export function reservationCancelPrepareSuccessResponse(
  action: StoredReservationCancelAction,
  reservation: ReservationReadModel,
  auditRefs: readonly ReservationDraftAuditRef[],
): ReservationCancelPrepareApiResponse {
  return {
    ok: true,
    operation: pmsReservationCancelPrepareOperation,
    status: 'ok',
    mutationStatus: 'none',
    idempotencyStatus: 'prepared',
    pendingAction: pendingActionReadModelFromCancelAction(action, auditRefs),
    reservation: cloneValue(reservation),
  };
}

export function reservationCancelPrepareRejectedResponse(
  request: ReservationCancelPrepareApiRequest,
  code: ApiErrorCode,
  message: string,
  field: string,
  reservation?: ReservationReadModel,
): ReservationCancelPrepareApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status: code === 'RESERVATION_CANCEL_NOT_FOUND' ? 'notFound' : 'rejected',
    mutationStatus: 'none',
    ...(reservation ? { reservation: cloneValue(reservation) } : {}),
    errors: [{ code, message, field }],
  };
}

export function reservationCancelTokenConflictResponse(
  request: ReservationCancelPrepareApiRequest,
): ReservationCancelPrepareApiResponse {
  return reservationCancelPrepareRejectedResponse(
    request,
    'RESERVATION_CANCEL_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
    'The reservation cancel client token was reused with a different request fingerprint.',
    'requestFingerprint',
  );
}

export function pendingActionSuccessResponseFromCancelAction(
  operation:
    | typeof pmsPendingActionStatusOperation
    | typeof pmsPendingActionConfirmOperation
    | typeof pmsPendingActionCancelOperation,
  idempotencyStatus: 'statusRead' | 'confirmed' | 'cancelled',
  mutationStatus: 'none' | 'deferred' | 'committed',
  action: StoredReservationCancelAction,
  auditRefs: readonly ReservationDraftAuditRef[],
  reservation?: ReservationReadModel,
): PendingActionCallbackApiResponse {
  return {
    ok: true,
    operation,
    status: 'ok',
    mutationStatus,
    idempotencyStatus,
    pendingAction: pendingActionReadModelFromCancelAction(action, auditRefs),
    ...(reservation ? { reservation: cloneValue(reservation) } : {}),
  };
}

export function pendingActionRejectedResponseFromCancelAction(
  request: PendingActionCallbackApiRequest,
  action: StoredReservationCancelAction,
  code: ApiErrorCode,
  message: string,
  field: string,
): PendingActionCallbackApiResponse {
  return {
    ok: false,
    operation: request.operation ?? pendingActionFallbackOperation(request),
    status: 'rejected',
    mutationStatus: 'none',
    pendingAction: pendingActionReadModelFromCancelAction(action),
    errors: [{ code, message, field }],
  };
}

export function isReservationCancelPrepareResponse(
  response: ApiIdempotencyRecord['response'],
): response is ReservationCancelPrepareApiResponse {
  return 'operation' in response && response.operation === pmsReservationCancelPrepareOperation;
}

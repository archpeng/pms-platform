import type {
  Actor,
  PendingActionCallbackIdempotencyStatus,
  PendingActionReadModel,
  PendingActionScopeRef,
  ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type PmsPendingActionOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

export interface PendingActionCallbackApiRequestBase {
  readonly operation?: PmsPendingActionOperation;
  readonly pendingActionRef: string;
  readonly actor: Actor;
  readonly scope: PendingActionScopeRef;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly cardPayloadRef?: string;
}

export interface PendingActionStatusApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionStatusOperation;
}

export interface PendingActionConfirmApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionConfirmOperation;
}

export interface PendingActionCancelApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionCancelOperation;
  readonly reason: string;
}

export type PendingActionCallbackApiRequest = PendingActionStatusApiRequest | PendingActionConfirmApiRequest | PendingActionCancelApiRequest;

export interface PendingActionCallbackSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsPendingActionOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'none' | 'deferred' | 'committed';
  readonly idempotencyStatus: PendingActionCallbackIdempotencyStatus;
  readonly pendingAction: PendingActionReadModel;
  readonly reservation?: ReservationReadModel;
}

export interface PendingActionCallbackErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsPendingActionOperation;
  readonly status: 'notFound' | 'rejected';
  readonly mutationStatus: 'none';
  readonly pendingAction?: PendingActionReadModel;
  readonly errors: readonly ApiError[];
}

export type PendingActionCallbackApiResponse = PendingActionCallbackSuccessApiResponse | PendingActionCallbackErrorApiResponse;

export interface PendingActionLifecycleStore {
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse;
  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse;
  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse;
}

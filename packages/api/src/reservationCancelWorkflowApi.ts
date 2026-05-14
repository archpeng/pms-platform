import type {
  Actor,
  CommandMeta,
  PendingActionReadModel,
  ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsReservationCancelPrepareOperation,
  type PmsReservationCancelWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

export interface ReservationCancelPrepareApiRequest {
  readonly operation: typeof pmsReservationCancelPrepareOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly reason: string;
  readonly expiresAt?: string;
}

export type ReservationCancelWorkflowApiRequest = ReservationCancelPrepareApiRequest;
export type ReservationCancelIdempotencyStatus = 'prepared' | 'replayed';

export interface ReservationCancelPrepareSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsReservationCancelWorkflowOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'none';
  readonly idempotencyStatus: ReservationCancelIdempotencyStatus;
  readonly pendingAction: PendingActionReadModel;
  readonly reservation: ReservationReadModel;
}

export interface ReservationCancelPrepareErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationCancelWorkflowOperation;
  readonly status: 'rejected' | 'notFound';
  readonly mutationStatus: 'none';
  readonly reservation?: ReservationReadModel;
  readonly errors: readonly ApiError[];
}

export type ReservationCancelPrepareApiResponse =
  | ReservationCancelPrepareSuccessApiResponse
  | ReservationCancelPrepareErrorApiResponse;

export interface ReservationCancelLifecycleStore {
  prepareReservationCancel(request: ReservationCancelPrepareApiRequest): ReservationCancelPrepareApiResponse;
}

export interface ExecuteReservationCancelApiOptions {
  readonly cancellations?: ReservationCancelLifecycleStore;
}

export function executeReservationCancelWorkflowApiRequest(
  request: ReservationCancelWorkflowApiRequest,
  options: ExecuteReservationCancelApiOptions = {},
): ReservationCancelPrepareApiResponse {
  if (options.cancellations && request.operation === pmsReservationCancelPrepareOperation) {
    return options.cancellations.prepareReservationCancel(request);
  }
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{
      code: 'RESERVATION_CANCEL_WORKFLOW_NOT_IMPLEMENTED',
      message: 'Reservation cancellation workflow is not implemented.',
      field: 'operation',
    }],
  };
}

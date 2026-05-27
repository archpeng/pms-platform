import type {
  Actor,
  CommandMeta,
  ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsReservationAdjustOperation,
  type PmsReservationAdjustWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

export interface ReservationAdjustApiRequest {
  readonly operation: typeof pmsReservationAdjustOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly targetRoomId?: string;
  readonly guestDisplayName?: string;
  readonly arrivalDate?: string;
  readonly departureDate?: string;
  readonly reason?: string;
}

export type ReservationAdjustWorkflowApiRequest = ReservationAdjustApiRequest;
export type ReservationAdjustIdempotencyStatus = 'committed' | 'replayed';

export interface ReservationAdjustSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsReservationAdjustWorkflowOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'committed';
  readonly idempotencyStatus: ReservationAdjustIdempotencyStatus;
  readonly originalReservation: ReservationReadModel;
  readonly reservation: ReservationReadModel;
}

export interface ReservationAdjustErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationAdjustWorkflowOperation;
  readonly status: 'rejected' | 'notFound';
  readonly mutationStatus: 'none';
  readonly originalReservation?: ReservationReadModel;
  readonly errors: readonly ApiError[];
}

export type ReservationAdjustApiResponse =
  | ReservationAdjustSuccessApiResponse
  | ReservationAdjustErrorApiResponse;

export interface ReservationAdjustLifecycleStore {
  adjustReservation(request: ReservationAdjustApiRequest): ReservationAdjustApiResponse;
}

export interface ExecuteReservationAdjustApiOptions {
  readonly adjustments?: ReservationAdjustLifecycleStore;
}

export function executeReservationAdjustWorkflowApiRequest(
  request: ReservationAdjustWorkflowApiRequest,
  options: ExecuteReservationAdjustApiOptions = {},
): ReservationAdjustApiResponse {
  if (options.adjustments && request.operation === pmsReservationAdjustOperation) {
    return options.adjustments.adjustReservation(request);
  }
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{
      code: 'RESERVATION_ADJUST_NOT_FOUND',
      message: 'Reservation adjustment workflow is not implemented.',
      field: 'operation',
    }],
  };
}

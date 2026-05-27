import type {
  Actor,
  CommandMeta,
  ReservationDraftWorkflowRef,
  ReservationGroupDraftWorkflowRef,
  ReservationReadModel,
} from '@pms-platform/contracts';
import {
  pmsReservationCreateOperation,
  pmsReservationGroupPrepareBookingOperation,
  pmsReservationPrepareBookingOperation,
  type PmsReservationCreateWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

interface ReservationCreateWorkflowApiRequestBase {
  readonly operation: PmsReservationCreateWorkflowOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly guestDisplayName: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly reason?: string;
}

export interface ReservationCreateApiRequest extends ReservationCreateWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationCreateOperation;
  readonly roomId: string;
}

export interface ReservationPrepareBookingApiRequest extends ReservationCreateWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationPrepareBookingOperation;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeKeyword?: string;
  readonly expiresAt?: string;
}

export interface ReservationGroupPrepareBookingApiRequest extends ReservationCreateWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupPrepareBookingOperation;
  readonly quantity: number;
  readonly roomTypeKeyword: string;
  readonly expiresAt?: string;
}

export type ReservationCreateWorkflowApiRequest =
  | ReservationCreateApiRequest
  | ReservationPrepareBookingApiRequest
  | ReservationGroupPrepareBookingApiRequest;

export type ReservationCreateApiResponse =
  | {
      readonly ok: true;
      readonly operation: typeof pmsReservationCreateOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'committed';
      readonly idempotencyStatus: 'committed' | 'replayed';
      readonly reservation: ReservationReadModel;
    }
  | {
      readonly ok: true;
      readonly operation: typeof pmsReservationPrepareBookingOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'none';
      readonly idempotencyStatus: 'prepared' | 'replayed';
      readonly draft: ReservationDraftWorkflowRef;
    }
  | {
      readonly ok: true;
      readonly operation: typeof pmsReservationGroupPrepareBookingOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'none';
      readonly idempotencyStatus: 'prepared' | 'replayed';
      readonly groupDraft: ReservationGroupDraftWorkflowRef;
    }
  | {
      readonly ok: false;
      readonly operation: PmsReservationCreateWorkflowOperation;
      readonly status: 'rejected' | 'notFound';
      readonly mutationStatus: 'none';
      readonly errors: readonly ApiError[];
    };

export interface ReservationCreateLifecycleStore {
  createReservation(request: ReservationCreateApiRequest): ReservationCreateApiResponse;
  prepareReservationBooking(request: ReservationPrepareBookingApiRequest): ReservationCreateApiResponse;
  prepareReservationGroupBooking(request: ReservationGroupPrepareBookingApiRequest): ReservationCreateApiResponse;
}

export interface ExecuteReservationCreateApiOptions {
  readonly creations?: ReservationCreateLifecycleStore;
}

export function executeReservationCreateWorkflowApiRequest(
  request: ReservationCreateWorkflowApiRequest,
  options: ExecuteReservationCreateApiOptions = {},
): ReservationCreateApiResponse {
  if (options.creations && request.operation === pmsReservationCreateOperation) return options.creations.createReservation(request);
  if (options.creations && request.operation === pmsReservationPrepareBookingOperation) return options.creations.prepareReservationBooking(request);
  if (options.creations && request.operation === pmsReservationGroupPrepareBookingOperation) return options.creations.prepareReservationGroupBooking(request);
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{ code: 'RESERVATION_CREATE_WORKFLOW_NOT_IMPLEMENTED', message: 'Reservation create workflow is not implemented.', field: 'operation' }],
  };
}

import type {
  OperationRequest,
  OperationRequestSource,
  OperationRequestStatus,
} from '@pms-platform/contracts';
import {
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  type PmsOperationRequestOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

export interface OperationRequestCreateApiRequest {
  readonly operation?: typeof pmsOperationRequestCreateOperation;
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly source: OperationRequestSource;
  readonly action: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly reservationId?: string;
  readonly payload?: Record<string, unknown>;
  readonly requestedAt: string;
}

export interface OperationRequestGetApiRequest {
  readonly operation?: typeof pmsOperationRequestGetOperation;
  readonly operationRequestId?: string;
  readonly clientToken?: string;
}

export interface OperationRequestListApiRequest {
  readonly operation?: typeof pmsOperationRequestListOperation;
  readonly status?: OperationRequestStatus;
  readonly roomId?: string;
  readonly limit?: number;
  readonly requestedAt?: string;
}

export interface OperationRequestUpdateApiRequest {
  readonly operation?: typeof pmsOperationRequestUpdateOperation;
  readonly operationRequestId?: string;
  readonly clientToken?: string;
  readonly status?: OperationRequestStatus;
  readonly result?: Record<string, unknown> | null;
  readonly updatedAt: string;
}

export interface OperationRequestApiErrorResponse {
  readonly ok: false;
  readonly operation: PmsOperationRequestOperation;
  readonly errors: readonly ApiError[];
}

export interface OperationRequestCreateApiSuccessResponse {
  readonly ok: true;
  readonly operation: typeof pmsOperationRequestCreateOperation;
  readonly idempotencyStatus: 'created' | 'replayed';
  readonly request: OperationRequest;
}

export interface OperationRequestGetApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsOperationRequestGetOperation;
  readonly request?: OperationRequest;
}

export interface OperationRequestListApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsOperationRequestListOperation;
  readonly requests: readonly OperationRequest[];
  readonly count: number;
  readonly truncated: boolean;
  readonly updatedAt: string;
  readonly filter: {
    readonly status?: OperationRequestStatus;
    readonly roomId?: string;
    readonly limit: number;
  };
}

export interface OperationRequestUpdateApiSuccessResponse {
  readonly ok: true;
  readonly operation: typeof pmsOperationRequestUpdateOperation;
  readonly request: OperationRequest;
}

export type OperationRequestCreateApiResponse = OperationRequestCreateApiSuccessResponse | OperationRequestApiErrorResponse;
export type OperationRequestUpdateApiResponse = OperationRequestUpdateApiSuccessResponse | OperationRequestApiErrorResponse;

import type {
  Actor,
  CommandMeta,
  ReservationDraftEvidenceRef,
  ReservationDraftMissingSlot,
  ReservationDraftSlots,
  ReservationDraftWorkflowRef,
  ReservationDraftWorkflowSafeGap,
} from '@pms-platform/contracts';
import {
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type PmsReservationDraftWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

interface ReservationDraftWorkflowApiRequestBase {
  readonly operation: PmsReservationDraftWorkflowOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly slots?: ReservationDraftSlots;
  readonly evidenceRefs?: readonly ReservationDraftEvidenceRef[];
  readonly expiresAt?: string;
}

export interface ReservationDraftCreateApiRequest extends ReservationDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationDraftCreateOperation;
}

export interface ReservationDraftUpdateApiRequest extends ReservationDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationDraftUpdateOperation;
  readonly draftRef?: string;
  readonly draftId?: string;
  readonly missingSlots?: readonly ReservationDraftMissingSlot[];
}

export interface ReservationQuoteApiRequest extends ReservationDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationQuoteOperation;
  readonly draftRef?: string;
  readonly draftId?: string;
}

export interface ReservationPrepareConfirmApiRequest extends ReservationDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationPrepareConfirmOperation;
  readonly draftRef?: string;
  readonly draftId?: string;
  readonly quoteRef?: string;
}

export interface ReservationDraftCancelApiRequest extends ReservationDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationDraftCancelOperation;
  readonly draftRef?: string;
  readonly draftId?: string;
  readonly reason: string;
}

export type ReservationDraftWorkflowApiRequest =
  | ReservationDraftCreateApiRequest
  | ReservationDraftUpdateApiRequest
  | ReservationQuoteApiRequest
  | ReservationPrepareConfirmApiRequest
  | ReservationDraftCancelApiRequest;

export type ReservationDraftIdempotencyStatus = 'created' | 'updated' | 'quoted' | 'prepared' | 'cancelled' | 'replayed';

export interface ReservationDraftWorkflowSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsReservationDraftWorkflowOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'draftOnly';
  readonly idempotencyStatus: ReservationDraftIdempotencyStatus;
  readonly draft: ReservationDraftWorkflowRef;
}

export interface ReservationDraftWorkflowSafeGapApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationDraftWorkflowOperation;
  readonly status: 'notImplemented';
  readonly mutationStatus: 'none';
  readonly draft?: ReservationDraftWorkflowRef;
  readonly gap: ReservationDraftWorkflowSafeGap;
  readonly errors: readonly ApiError[];
}

export interface ReservationDraftWorkflowErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationDraftWorkflowOperation;
  readonly status: 'rejected' | 'notFound';
  readonly mutationStatus: 'none';
  readonly draft?: ReservationDraftWorkflowRef;
  readonly errors: readonly ApiError[];
}

export type ReservationDraftWorkflowApiResponse =
  | ReservationDraftWorkflowSuccessApiResponse
  | ReservationDraftWorkflowSafeGapApiResponse
  | ReservationDraftWorkflowErrorApiResponse;


export interface ReservationDraftLifecycleStore {
  createReservationDraft(request: ReservationDraftCreateApiRequest): ReservationDraftWorkflowApiResponse;
  updateReservationDraft(request: ReservationDraftUpdateApiRequest): ReservationDraftWorkflowApiResponse;
  quoteReservationDraft(request: ReservationQuoteApiRequest): ReservationDraftWorkflowApiResponse;
  prepareConfirmReservationDraft(request: ReservationPrepareConfirmApiRequest): ReservationDraftWorkflowApiResponse;
  cancelReservationDraft(request: ReservationDraftCancelApiRequest): ReservationDraftWorkflowApiResponse;
}

export interface ExecuteReservationDraftWorkflowApiOptions {
  readonly drafts?: ReservationDraftLifecycleStore;
}

export function executeReservationDraftWorkflowApiRequest(
  request: ReservationDraftWorkflowApiRequest,
  options: ExecuteReservationDraftWorkflowApiOptions = {},
): ReservationDraftWorkflowApiResponse {
  if (options.drafts && request.operation === pmsReservationDraftCreateOperation) {
    return options.drafts.createReservationDraft(request);
  }
  if (options.drafts && request.operation === pmsReservationDraftUpdateOperation) {
    return options.drafts.updateReservationDraft(request);
  }
  if (options.drafts && request.operation === pmsReservationQuoteOperation) {
    return options.drafts.quoteReservationDraft(request);
  }
  if (options.drafts && request.operation === pmsReservationPrepareConfirmOperation) {
    return options.drafts.prepareConfirmReservationDraft(request);
  }
  if (options.drafts && request.operation === pmsReservationDraftCancelOperation) {
    return options.drafts.cancelReservationDraft(request);
  }

  const gap: ReservationDraftWorkflowSafeGap = {
    code: 'RESERVATION_DRAFT_WORKFLOW_NOT_IMPLEMENTED',
    owner: 'pms-platform',
    mutationStatus: 'none',
    message: 'Reservation draft workflow storage and mutation behavior are intentionally not implemented in this contract skeleton.',
  };

  return {
    ok: false,
    operation: request.operation,
    status: 'notImplemented',
    mutationStatus: 'none',
    draft: {
      workflowType: 'reservation',
      ...(isDraftScopedRequest(request) ? draftContextFromRequest(request) : {}),
      status: 'collectingSlots',
      missingSlots: [],
      evidenceRefs: request.evidenceRefs ?? [],
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    },
    gap,
    errors: [
      {
        code: gap.code,
        message: gap.message,
        field: 'operation',
      },
    ],
  };
}

function isDraftScopedRequest(
  request: ReservationDraftWorkflowApiRequest,
): request is ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest {
  return 'draftRef' in request || 'draftId' in request;
}

function draftContextFromRequest(
  request: ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest,
): { draftRef?: string; draftId?: string } {
  return {
    ...(request.draftRef ? { draftRef: request.draftRef } : {}),
    ...(request.draftId ? { draftId: request.draftId } : {}),
  };
}

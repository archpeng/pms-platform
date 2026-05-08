import type {
  Actor,
  CommandMeta,
  ReservationGroupDraftEvidenceRef,
  ReservationGroupDraftMissingSlot,
  ReservationGroupDraftSlots,
  ReservationGroupDraftWorkflowRef,
  ReservationGroupDraftWorkflowSafeGap,
} from '@pms-platform/contracts';
import {
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  type PmsReservationGroupDraftWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

interface ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: PmsReservationGroupDraftWorkflowOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly slots?: ReservationGroupDraftSlots;
  readonly evidenceRefs?: readonly ReservationGroupDraftEvidenceRef[];
  readonly expiresAt?: string;
}

export interface ReservationGroupDraftCreateApiRequest extends ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupDraftCreateOperation;
}

export interface ReservationGroupDraftUpdateApiRequest extends ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupDraftUpdateOperation;
  readonly groupDraftRef?: string;
  readonly groupDraftId?: string;
  readonly missingSlots?: readonly ReservationGroupDraftMissingSlot[];
}

export interface ReservationGroupQuoteApiRequest extends ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupQuoteOperation;
  readonly groupDraftRef?: string;
  readonly groupDraftId?: string;
}

export interface ReservationGroupPrepareConfirmApiRequest extends ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupPrepareConfirmOperation;
  readonly groupDraftRef?: string;
  readonly groupDraftId?: string;
  readonly quoteRef?: string;
}

export interface ReservationGroupDraftCancelApiRequest extends ReservationGroupDraftWorkflowApiRequestBase {
  readonly operation: typeof pmsReservationGroupDraftCancelOperation;
  readonly groupDraftRef?: string;
  readonly groupDraftId?: string;
  readonly reason: string;
}

export type ReservationGroupDraftWorkflowApiRequest =
  | ReservationGroupDraftCreateApiRequest
  | ReservationGroupDraftUpdateApiRequest
  | ReservationGroupQuoteApiRequest
  | ReservationGroupPrepareConfirmApiRequest
  | ReservationGroupDraftCancelApiRequest;

export type ReservationGroupDraftIdempotencyStatus = 'created' | 'updated' | 'quoted' | 'prepared' | 'cancelled' | 'replayed';

export interface ReservationGroupDraftWorkflowSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsReservationGroupDraftWorkflowOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'draftOnly';
  readonly idempotencyStatus: ReservationGroupDraftIdempotencyStatus;
  readonly groupDraft: ReservationGroupDraftWorkflowRef;
}

export interface ReservationGroupDraftWorkflowSafeGapApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationGroupDraftWorkflowOperation;
  readonly status: 'notImplemented';
  readonly mutationStatus: 'none';
  readonly groupDraft?: ReservationGroupDraftWorkflowRef;
  readonly gap: ReservationGroupDraftWorkflowSafeGap;
  readonly errors: readonly ApiError[];
}

export interface ReservationGroupDraftWorkflowErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsReservationGroupDraftWorkflowOperation;
  readonly status: 'rejected' | 'notFound';
  readonly mutationStatus: 'none';
  readonly groupDraft?: ReservationGroupDraftWorkflowRef;
  readonly errors: readonly ApiError[];
}

export type ReservationGroupDraftWorkflowApiResponse =
  | ReservationGroupDraftWorkflowSuccessApiResponse
  | ReservationGroupDraftWorkflowSafeGapApiResponse
  | ReservationGroupDraftWorkflowErrorApiResponse;

export interface ReservationGroupDraftLifecycleStore {
  createReservationGroupDraft(request: ReservationGroupDraftCreateApiRequest): ReservationGroupDraftWorkflowApiResponse;
  updateReservationGroupDraft(request: ReservationGroupDraftUpdateApiRequest): ReservationGroupDraftWorkflowApiResponse;
  quoteReservationGroupDraft(request: ReservationGroupQuoteApiRequest): ReservationGroupDraftWorkflowApiResponse;
  prepareConfirmReservationGroupDraft(request: ReservationGroupPrepareConfirmApiRequest): ReservationGroupDraftWorkflowApiResponse;
  cancelReservationGroupDraft(request: ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse;
}

export interface ExecuteReservationGroupDraftWorkflowApiOptions {
  readonly groupDrafts?: ReservationGroupDraftLifecycleStore;
}

export function executeReservationGroupDraftWorkflowApiRequest(
  request: ReservationGroupDraftWorkflowApiRequest,
  options: ExecuteReservationGroupDraftWorkflowApiOptions = {},
): ReservationGroupDraftWorkflowApiResponse {
  if (options.groupDrafts && request.operation === pmsReservationGroupDraftCreateOperation) {
    return options.groupDrafts.createReservationGroupDraft(request);
  }
  if (options.groupDrafts && request.operation === pmsReservationGroupDraftUpdateOperation) {
    return options.groupDrafts.updateReservationGroupDraft(request);
  }
  if (options.groupDrafts && request.operation === pmsReservationGroupQuoteOperation) {
    return options.groupDrafts.quoteReservationGroupDraft(request);
  }
  if (options.groupDrafts && request.operation === pmsReservationGroupPrepareConfirmOperation) {
    return options.groupDrafts.prepareConfirmReservationGroupDraft(request);
  }
  if (options.groupDrafts && request.operation === pmsReservationGroupDraftCancelOperation) {
    return options.groupDrafts.cancelReservationGroupDraft(request);
  }

  const gap: ReservationGroupDraftWorkflowSafeGap = {
    code: 'RESERVATION_GROUP_DRAFT_WORKFLOW_NOT_IMPLEMENTED',
    owner: 'pms-platform',
    mutationStatus: 'none',
    message: 'Reservation group draft workflow storage and mutation behavior are intentionally not implemented in this contract skeleton.',
  };

  return {
    ok: false,
    operation: request.operation,
    status: 'notImplemented',
    mutationStatus: 'none',
    groupDraft: {
      workflowType: 'reservationGroup',
      ...(isGroupDraftScopedRequest(request) ? groupDraftContextFromRequest(request) : {}),
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

function isGroupDraftScopedRequest(
  request: ReservationGroupDraftWorkflowApiRequest,
): request is ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest {
  return 'groupDraftRef' in request || 'groupDraftId' in request;
}

function groupDraftContextFromRequest(
  request: ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest,
): { groupDraftRef?: string; groupDraftId?: string } {
  return {
    ...(request.groupDraftRef ? { groupDraftRef: request.groupDraftRef } : {}),
    ...(request.groupDraftId ? { groupDraftId: request.groupDraftId } : {}),
  };
}

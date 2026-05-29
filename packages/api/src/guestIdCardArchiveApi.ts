import type { Actor, CommandMeta } from '@pms-platform/contracts';
import type {
  PmsGuestIdCardConfirmOperation,
  PmsGuestIdCardPrepareOperation,
  PmsGuestIdCardWorkflowOperation,
} from './operations.js';
import type { ApiError } from './errors.js';

// Guest ID-card (身份证) archive — a single, idempotent guest-scoped row write tied to a reservation.
// The raw ID number travels only as a stored value; `idNumberHash` is the redaction-safe handle the
// agent trace / approval cards carry (the raw number must never reach a traced event field).
export interface GuestIdCardArchiveApiRequest {
  readonly operation: PmsGuestIdCardWorkflowOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly reservationRef: string;
  readonly name: string;
  readonly idNumber: string;
  readonly idNumberHash: string;
  readonly documentType?: string;
  readonly dob?: string;
  readonly address?: string;
  readonly photoHash?: string;
  readonly reason?: string;
}

// Evidence-style fact. Summary carries NO raw PII — only the guest/reservation handles + the hash.
export interface GuestIdCardArchiveFact {
  readonly guestId: string;
  readonly reservationCode: string;
  readonly displayName: string;
  readonly documentType: string;
  readonly idNumberHash: string;
  readonly status: 'archived';
  readonly archivedAt: string;
}

export type GuestIdCardArchiveApiResponse =
  | {
      readonly ok: true;
      readonly operation: PmsGuestIdCardWorkflowOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'committed';
      readonly idempotencyStatus: 'committed' | 'replayed';
      readonly idCard: GuestIdCardArchiveFact;
    }
  | {
      readonly ok: false;
      readonly operation: PmsGuestIdCardWorkflowOperation;
      readonly status: 'rejected' | 'notFound';
      readonly mutationStatus: 'none';
      readonly errors: readonly ApiError[];
    };

export interface GuestIdCardArchiveLifecycleStore {
  archiveGuestIdCard(request: GuestIdCardArchiveApiRequest): GuestIdCardArchiveApiResponse;
}

export interface ExecuteGuestIdCardArchiveApiOptions {
  readonly archives?: GuestIdCardArchiveLifecycleStore;
}

export function executeGuestIdCardArchiveWorkflowApiRequest(
  request: GuestIdCardArchiveApiRequest,
  options: ExecuteGuestIdCardArchiveApiOptions = {},
): GuestIdCardArchiveApiResponse {
  if (options.archives) return options.archives.archiveGuestIdCard(request);
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [
      {
        code: 'GUEST_ID_CARD_ARCHIVE_NOT_IMPLEMENTED',
        message: 'Guest ID-card archive workflow is not implemented.',
        field: 'operation',
      },
    ],
  };
}

// Server-side-draft prepare: the raw ID number lands in a guest_id_card_drafts row keyed by a
// pendingActionRef; the response carries only the hash + a masked echo (e.g. 1101**********1234).
export interface GuestIdCardPrepareApiRequest {
  readonly operation: PmsGuestIdCardPrepareOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly reservationRef: string;
  readonly name: string;
  readonly idNumber: string;
  readonly idNumberHash?: string;
  readonly documentType?: string;
  readonly expiresAt?: string;
}

// Carries NO raw ID number — only the hash, a masked echo, and the refs needed to confirm later.
export interface GuestIdCardPreparationFact {
  readonly draftRef: string;
  readonly pendingActionRef: string;
  readonly cardPayloadRef: string;
  readonly guestId: string;
  readonly reservationCode: string;
  readonly displayName: string;
  readonly documentType: string;
  readonly idNumberHash: string;
  readonly maskedIdNumber: string;
  readonly status: 'awaitingConfirmation';
  readonly expiresAt: string;
}

export interface GuestIdCardConfirmApiRequest {
  readonly operation: PmsGuestIdCardConfirmOperation;
  readonly propertyId: string;
  readonly actor: Actor;
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly pendingActionRef: string;
  readonly cardPayloadRef: string;
}

export type GuestIdCardPrepareApiResponse =
  | {
      readonly ok: true;
      readonly operation: PmsGuestIdCardPrepareOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'none';
      readonly idempotencyStatus: 'prepared' | 'replayed';
      readonly preparation: GuestIdCardPreparationFact;
    }
  | {
      readonly ok: false;
      readonly operation: PmsGuestIdCardPrepareOperation;
      readonly status: 'rejected' | 'notFound';
      readonly mutationStatus: 'none';
      readonly errors: readonly ApiError[];
    };

export type GuestIdCardConfirmApiResponse =
  | {
      readonly ok: true;
      readonly operation: PmsGuestIdCardConfirmOperation;
      readonly status: 'ok';
      readonly mutationStatus: 'committed';
      readonly idempotencyStatus: 'committed' | 'replayed';
      readonly idCard: GuestIdCardArchiveFact;
    }
  | {
      readonly ok: false;
      readonly operation: PmsGuestIdCardConfirmOperation;
      readonly status: 'rejected' | 'notFound';
      readonly mutationStatus: 'none';
      readonly errors: readonly ApiError[];
    };

export interface GuestIdCardPrepareLifecycleStore {
  prepareGuestIdCard(request: GuestIdCardPrepareApiRequest): GuestIdCardPrepareApiResponse;
  confirmGuestIdCard(request: GuestIdCardConfirmApiRequest): GuestIdCardConfirmApiResponse;
}

export interface ExecuteGuestIdCardPrepareApiOptions {
  readonly preparations?: GuestIdCardPrepareLifecycleStore;
}

export function executeGuestIdCardPrepareWorkflowApiRequest(
  request: GuestIdCardPrepareApiRequest,
  options: ExecuteGuestIdCardPrepareApiOptions = {},
): GuestIdCardPrepareApiResponse {
  if (options.preparations) return options.preparations.prepareGuestIdCard(request);
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{ code: 'GUEST_ID_CARD_ARCHIVE_NOT_IMPLEMENTED', message: 'Guest ID-card prepare workflow is not implemented.', field: 'operation' }],
  };
}

export function executeGuestIdCardConfirmWorkflowApiRequest(
  request: GuestIdCardConfirmApiRequest,
  options: ExecuteGuestIdCardPrepareApiOptions = {},
): GuestIdCardConfirmApiResponse {
  if (options.preparations) return options.preparations.confirmGuestIdCard(request);
  return {
    ok: false,
    operation: request.operation,
    status: 'rejected',
    mutationStatus: 'none',
    errors: [{ code: 'GUEST_ID_CARD_ARCHIVE_NOT_IMPLEMENTED', message: 'Guest ID-card confirm workflow is not implemented.', field: 'operation' }],
  };
}

import type { Actor, CheckInCommand, CheckOutCommand, CommandMeta } from '@pms-platform/contracts';
import { pmsCheckInOperation, pmsCheckOutOperation, type PmsApiMode, type PmsCommandOperation } from './operations.js';
import type { CheckInApiRequest, CheckOutApiRequest, PmsExtendedCommandApiRequest } from './commandApi.js';
import type { StableErrorPassthrough } from './errors.js';

export interface RequestFingerprintInput {
  readonly operation: PmsCommandOperation;
  readonly mode: PmsApiMode;
  readonly roomId: CheckInCommand['roomId'] | CheckOutCommand['roomId'];
  readonly actor: Actor;
  readonly source: CommandMeta['source'];
  readonly reason: CommandMeta['reason'];
  readonly correlationId: CommandMeta['correlationId'];
  readonly requestedAt: CommandMeta['requestedAt'];
  readonly parameters?: Record<string, unknown>;
}

export interface RequestFingerprintEnvelope {
  readonly idempotencyKey: CommandMeta['idempotencyKey'];
  readonly requestFingerprint: string;
  readonly fingerprintInput: RequestFingerprintInput;
}

export function requestFingerprintInput(request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest): RequestFingerprintInput {
  return {
    operation: request.operation,
    mode: request.mode,
    roomId: request.roomId,
    actor: { ...request.actor },
    source: request.source,
    reason: request.reason,
    correlationId: request.correlationId,
    requestedAt: request.requestedAt,
    ...extendedFingerprintParameters(request),
  };
}

export function requestFingerprintEnvelope(request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest): RequestFingerprintEnvelope {
  return {
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    fingerprintInput: requestFingerprintInput(request),
  };
}

function extendedFingerprintParameters(
  request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest,
): { readonly parameters?: Record<string, unknown> } {
  const record = request as unknown as Record<string, unknown>;
  const parameters: Record<string, unknown> = {};
  const keys = request.operation === pmsCheckInOperation || request.operation === pmsCheckOutOperation
    ? ['reservationId', 'reservationCode'] as const
    : ['inspectionRequired', 'result', 'taskId', 'severity', 'stopSellRequested', 'note', 'ticketId'] as const;
  for (const key of keys) {
    if (record[key] !== undefined) {
      parameters[key] = record[key];
    }
  }
  return Object.keys(parameters).length > 0 ? { parameters } : {};
}

export function incompatibleFingerprintResponse(request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest): StableErrorPassthrough {
  return {
    ok: false,
    mode: request.mode,
    errors: [
      {
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT',
        message: 'The idempotency key was reused with a different request fingerprint.',
        field: 'requestFingerprint',
      },
    ],
  };
}

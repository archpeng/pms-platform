import type { Actor, CheckOutCommand, CommandExecutionMode, CommandMeta, DomainError } from '@pms-platform/contracts';
import {
  checkOut,
  type CheckOutResult,
  type CoreCheckOutConfirmResult,
  type CoreCheckOutDryRunPlan,
  type CorePorts,
} from '@pms-platform/core';

export const apiPackageName = '@pms-platform/api';
export const pmsCheckOutOperation = 'pms_check_out';

export type CheckOutApiMode = 'dryRun' | 'confirm';
export type ApiBoundaryErrorCode = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT';
export type ApiErrorCode = DomainError['code'] | ApiBoundaryErrorCode;

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly field?: string;
}

export interface RequestFingerprintInput {
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: CheckOutApiMode;
  readonly roomId: CheckOutCommand['roomId'];
  readonly actor: Actor;
  readonly source: CommandMeta['source'];
  readonly reason: CommandMeta['reason'];
  readonly correlationId: CommandMeta['correlationId'];
  readonly requestedAt: CommandMeta['requestedAt'];
}

export interface RequestFingerprintEnvelope {
  readonly idempotencyKey: CommandMeta['idempotencyKey'];
  readonly requestFingerprint: string;
  readonly fingerprintInput: RequestFingerprintInput;
}

interface CheckOutApiRequestBase {
  readonly operation: typeof pmsCheckOutOperation;
  readonly roomId: CheckOutCommand['roomId'];
  readonly actor: Actor;
  readonly reason: CommandMeta['reason'];
  readonly idempotencyKey: CommandMeta['idempotencyKey'];
  readonly correlationId: CommandMeta['correlationId'];
  readonly requestedAt: CommandMeta['requestedAt'];
  readonly requestFingerprint: string;
}

export interface CheckOutDryRunApiRequest extends CheckOutApiRequestBase {
  readonly mode: 'dryRun';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
}

export interface CheckOutConfirmApiRequest extends CheckOutApiRequestBase {
  readonly mode: 'confirm';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
}

export type CheckOutApiRequest = CheckOutDryRunApiRequest | CheckOutConfirmApiRequest;

export interface StableErrorPassthrough {
  readonly ok: false;
  readonly mode: CommandExecutionMode | 'unsupported';
  readonly errors: readonly ApiError[];
}

export interface CheckOutDryRunApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'dryRun';
  readonly request: RequestFingerprintEnvelope;
  readonly plan: CoreCheckOutDryRunPlan;
}

export interface CheckOutConfirmApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'confirm';
  readonly request: RequestFingerprintEnvelope;
  readonly result: CoreCheckOutConfirmResult;
}

export type CheckOutApiResponse = CheckOutDryRunApiResponse | CheckOutConfirmApiResponse | StableErrorPassthrough;

export interface ApiIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly response: CheckOutApiResponse;
}

export interface ApiIdempotencyRepository {
  get(idempotencyKey: string): ApiIdempotencyRecord | undefined;
  save(record: ApiIdempotencyRecord): void;
  list(): readonly ApiIdempotencyRecord[];
}

export interface ExecuteCheckOutApiOptions {
  readonly idempotency?: ApiIdempotencyRepository;
}

export function executeCheckOutApiRequest(
  request: CheckOutApiRequest,
  ports: CorePorts,
  options: ExecuteCheckOutApiOptions = {},
): CheckOutApiResponse {
  const idempotency = options.idempotency;
  const existing = idempotency?.get(request.idempotencyKey);

  if (existing && existing.requestFingerprint !== request.requestFingerprint) {
    return incompatibleFingerprintResponse(request);
  }

  if (existing) {
    return existing.response;
  }

  const response = toCheckOutApiResponse(request, checkOut(toCheckOutCommand(request), ports));
  idempotency?.save({
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    response,
  });
  return response;
}

export function toCheckOutCommand(request: CheckOutApiRequest): CheckOutCommand {
  return {
    type: 'CHECK_OUT',
    roomId: request.roomId,
    meta: {
      actor: { ...request.actor },
      source: request.source,
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      mode: request.mode,
    },
  };
}

export function toCheckOutApiResponse(request: CheckOutApiRequest, result: CheckOutResult): CheckOutApiResponse {
  if (!result.ok) {
    return {
      ok: false,
      mode: result.mode,
      errors: result.errors,
    };
  }

  const requestEnvelope = requestFingerprintEnvelope(request);

  if (result.mode === 'dryRun') {
    return {
      ok: true,
      operation: pmsCheckOutOperation,
      mode: 'dryRun',
      request: requestEnvelope,
      plan: result.plan,
    };
  }

  return {
    ok: true,
    operation: pmsCheckOutOperation,
    mode: 'confirm',
    request: requestEnvelope,
    result: result.result,
  };
}

export function requestFingerprintInput(request: CheckOutApiRequest): RequestFingerprintInput {
  return {
    operation: request.operation,
    mode: request.mode,
    roomId: request.roomId,
    actor: { ...request.actor },
    source: request.source,
    reason: request.reason,
    correlationId: request.correlationId,
    requestedAt: request.requestedAt,
  };
}

export function requestFingerprintEnvelope(request: CheckOutApiRequest): RequestFingerprintEnvelope {
  return {
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    fingerprintInput: requestFingerprintInput(request),
  };
}

export function createInMemoryApiIdempotencyRepository(
  initialRecords: readonly ApiIdempotencyRecord[] = [],
): ApiIdempotencyRepository {
  const records = new Map(initialRecords.map((record) => [record.idempotencyKey, cloneRecord(record)]));

  return {
    get(idempotencyKey) {
      const record = records.get(idempotencyKey);
      return record ? cloneRecord(record) : undefined;
    },
    save(record) {
      records.set(record.idempotencyKey, cloneRecord(record));
    },
    list() {
      return Array.from(records.values(), cloneRecord);
    },
  };
}

export function describeApiContractBoundary() {
  return {
    packageName: apiPackageName,
    operation: pmsCheckOutOperation,
    importsCoreResult: true,
    exposesLocalHandler: true,
    supportedModes: ['dryRun', 'confirm'] as const,
  };
}

function incompatibleFingerprintResponse(request: CheckOutApiRequest): StableErrorPassthrough {
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

function cloneRecord(record: ApiIdempotencyRecord): ApiIdempotencyRecord {
  return cloneValue(record);
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

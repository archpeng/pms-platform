import type {
  Actor,
  CheckInCommand,
  CheckOutCommand,
  CommandExecutionMode,
  CommandMeta,
  DashboardReadModel,
  DomainError,
  RoomReadModel,
} from '@pms-platform/contracts';
import {
  checkIn,
  checkOut,
  getDashboardReadModel,
  getRoomReadModel,
  type CheckInResult,
  type CheckOutResult,
  type CoreCheckInConfirmResult,
  type CoreCheckInDryRunPlan,
  type CoreCheckOutConfirmResult,
  type CoreCheckOutDryRunPlan,
  type CorePorts,
} from '@pms-platform/core';

export const apiPackageName = '@pms-platform/api';
export const pmsCheckInOperation = 'pms_check_in';
export const pmsCheckOutOperation = 'pms_check_out';
export const pmsGetRoomOperation = 'pms_get_room';
export const pmsDashboardOperation = 'pms_dashboard';

export type PmsCommandOperation = typeof pmsCheckInOperation | typeof pmsCheckOutOperation;
export type PmsReadModelOperation = typeof pmsGetRoomOperation | typeof pmsDashboardOperation;
export type PmsApiMode = 'dryRun' | 'confirm';
export type CheckOutApiMode = PmsApiMode;
export type ApiBoundaryErrorCode = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT';
export type ApiErrorCode = DomainError['code'] | ApiBoundaryErrorCode;

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly field?: string;
}

export interface RequestFingerprintInput {
  readonly operation: PmsCommandOperation;
  readonly mode: PmsApiMode;
  readonly roomId: CheckInCommand['roomId'] | CheckOutCommand['roomId'];
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

interface PmsCommandApiRequestBase {
  readonly operation: PmsCommandOperation;
  readonly roomId: CheckInCommand['roomId'] | CheckOutCommand['roomId'];
  readonly actor: Actor;
  readonly reason: CommandMeta['reason'];
  readonly idempotencyKey: CommandMeta['idempotencyKey'];
  readonly correlationId: CommandMeta['correlationId'];
  readonly requestedAt: CommandMeta['requestedAt'];
  readonly requestFingerprint: string;
}

export interface CheckInDryRunApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckInOperation;
  readonly mode: 'dryRun';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly overrideDirtyRoom?: boolean;
}

export interface CheckInConfirmApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckInOperation;
  readonly mode: 'confirm';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly overrideDirtyRoom?: boolean;
}

export type CheckInApiRequest = CheckInDryRunApiRequest | CheckInConfirmApiRequest;

export interface CheckOutDryRunApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'dryRun';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
}

export interface CheckOutConfirmApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'confirm';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
}

export type CheckOutApiRequest = CheckOutDryRunApiRequest | CheckOutConfirmApiRequest;

export interface StableErrorPassthrough {
  readonly ok: false;
  readonly mode: CommandExecutionMode | 'unsupported';
  readonly errors: readonly ApiError[];
}

export interface CheckInDryRunApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsCheckInOperation;
  readonly mode: 'dryRun';
  readonly request: RequestFingerprintEnvelope;
  readonly plan: CoreCheckInDryRunPlan;
}

export interface CheckInConfirmApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsCheckInOperation;
  readonly mode: 'confirm';
  readonly request: RequestFingerprintEnvelope;
  readonly result: CoreCheckInConfirmResult;
}

export type CheckInApiResponse = CheckInDryRunApiResponse | CheckInConfirmApiResponse | StableErrorPassthrough;

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

export interface GetRoomApiRequest {
  readonly operation: typeof pmsGetRoomOperation;
  readonly roomId: string;
  readonly requestedAt: string;
}

export interface GetRoomApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsGetRoomOperation;
  readonly readModel: RoomReadModel;
}

export interface DashboardApiRequest {
  readonly operation: typeof pmsDashboardOperation;
  readonly requestedAt: string;
}

export interface DashboardApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsDashboardOperation;
  readonly readModel: DashboardReadModel;
}

export type PmsReadModelApiRequest = GetRoomApiRequest | DashboardApiRequest;
export type PmsReadModelApiResponse = GetRoomApiResponse | DashboardApiResponse;

export interface ApiIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly response: CheckInApiResponse | CheckOutApiResponse;
}

export interface ApiIdempotencyRepository {
  get(idempotencyKey: string): ApiIdempotencyRecord | undefined;
  save(record: ApiIdempotencyRecord): void;
  list(): readonly ApiIdempotencyRecord[];
}

export interface ExecuteCheckOutApiOptions {
  readonly idempotency?: ApiIdempotencyRepository;
}

export type ExecuteCheckInApiOptions = ExecuteCheckOutApiOptions;

export function executeCheckInApiRequest(
  request: CheckInApiRequest,
  ports: CorePorts,
  options: ExecuteCheckInApiOptions = {},
): CheckInApiResponse {
  const idempotency = options.idempotency;
  const existing = idempotency?.get(request.idempotencyKey);

  if (existing && existing.requestFingerprint !== request.requestFingerprint) {
    return incompatibleFingerprintResponse(request);
  }

  if (existing) {
    return existing.response as CheckInApiResponse;
  }

  const response = toCheckInApiResponse(request, checkIn(toCheckInCommand(request), ports));
  idempotency?.save({
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    response,
  });
  return response;
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
    return existing.response as CheckOutApiResponse;
  }

  const response = toCheckOutApiResponse(request, checkOut(toCheckOutCommand(request), ports));
  idempotency?.save({
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    response,
  });
  return response;
}

export function toCheckInCommand(request: CheckInApiRequest): CheckInCommand {
  return {
    type: 'CHECK_IN',
    roomId: request.roomId,
    overrideDirtyRoom: request.overrideDirtyRoom,
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

export function toCheckInApiResponse(request: CheckInApiRequest, result: CheckInResult): CheckInApiResponse {
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
      operation: pmsCheckInOperation,
      mode: 'dryRun',
      request: requestEnvelope,
      plan: result.plan,
    };
  }

  return {
    ok: true,
    operation: pmsCheckInOperation,
    mode: 'confirm',
    request: requestEnvelope,
    result: result.result,
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

export function requestFingerprintInput(request: CheckInApiRequest | CheckOutApiRequest): RequestFingerprintInput {
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

export function requestFingerprintEnvelope(request: CheckInApiRequest | CheckOutApiRequest): RequestFingerprintEnvelope {
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

export function executeGetRoomApiRequest(request: GetRoomApiRequest, ports: CorePorts): GetRoomApiResponse {
  return {
    ok: true,
    operation: pmsGetRoomOperation,
    readModel: getRoomReadModel(request.roomId, ports, request.requestedAt),
  };
}

export function executeDashboardApiRequest(request: DashboardApiRequest, ports: CorePorts): DashboardApiResponse {
  return {
    ok: true,
    operation: pmsDashboardOperation,
    readModel: getDashboardReadModel(ports, request.requestedAt),
  };
}

export function describeApiContractBoundary() {
  return {
    packageName: apiPackageName,
    operation: pmsCheckOutOperation,
    operations: [pmsCheckInOperation, pmsCheckOutOperation, pmsGetRoomOperation, pmsDashboardOperation] as const,
    importsCoreResult: true,
    exposesLocalHandler: true,
    supportedModes: ['dryRun', 'confirm'] as const,
  };
}

function incompatibleFingerprintResponse(request: CheckInApiRequest | CheckOutApiRequest): StableErrorPassthrough {
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

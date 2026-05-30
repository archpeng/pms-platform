import type {
  Actor,
  CheckInCommand,
  CheckOutCommand,
  CommandMeta,
  HousekeepingDoneCommand,
  HousekeepingInspectionCommand,
  HousekeepingMarkDirtyCommand,
  HousekeepingReworkCommand,
  MaintenanceDoneCommand,
  ReportMaintenanceCommand,
  RestoreSellableCommand,
} from '@pms-platform/contracts';
import {
  checkIn,
  checkOut,
  housekeepingDone,
  housekeepingInspection,
  housekeepingMarkDirty,
  housekeepingRework,
  maintenanceDone,
  reportMaintenance,
  restoreSellable,
  type CheckInResult,
  type CheckOutResult,
  type CoreCheckInConfirmResult,
  type CoreCheckInDryRunPlan,
  type CoreCheckOutConfirmResult,
  type CoreCheckOutDryRunPlan,
  type CorePmsCommandConfirmResult,
  type CorePorts,
  type PmsCommandResult,
} from '@pms-platform/core';
import {
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingMarkDirtyOperation,
  pmsHousekeepingReworkOperation,
  pmsMaintenanceDoneOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type PmsApiMode,
  type PmsCommandOperation,
} from './operations.js';
import type { ApiIdempotencyRepository } from './idempotency.js';
import type { StableErrorPassthrough } from './errors.js';
import { incompatibleFingerprintResponse, requestFingerprintEnvelope, type RequestFingerprintEnvelope } from './fingerprint.js';

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
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly overrideDirtyRoom?: boolean;
}

export interface CheckInConfirmApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckInOperation;
  readonly mode: 'confirm';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly overrideDirtyRoom?: boolean;
}

export type CheckInApiRequest = CheckInDryRunApiRequest | CheckInConfirmApiRequest;

export interface CheckOutDryRunApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'dryRun';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly reservationId?: string;
  readonly reservationCode?: string;
}

export interface CheckOutConfirmApiRequest extends PmsCommandApiRequestBase {
  readonly operation: typeof pmsCheckOutOperation;
  readonly mode: 'confirm';
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
  readonly reservationId?: string;
  readonly reservationCode?: string;
}

export type CheckOutApiRequest = CheckOutDryRunApiRequest | CheckOutConfirmApiRequest;

interface PmsExtendedCommandApiRequestBase extends PmsCommandApiRequestBase {
  readonly source: Extract<CommandMeta['source'], 'api' | 'mcp' | 'test'>;
}

export interface HousekeepingDoneApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsHousekeepingDoneOperation;
  readonly mode: PmsApiMode;
  readonly inspectionRequired?: boolean;
}

export interface HousekeepingInspectionApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsHousekeepingInspectionOperation;
  readonly mode: PmsApiMode;
  readonly result: 'pass' | 'fail';
  readonly taskId?: string;
}

export interface HousekeepingReworkApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsHousekeepingReworkOperation;
  readonly mode: PmsApiMode;
  readonly inspectionRequired?: boolean;
  readonly taskId?: string;
}

export interface HousekeepingMarkDirtyApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsHousekeepingMarkDirtyOperation;
  readonly mode: PmsApiMode;
}

export interface ReportMaintenanceApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsReportMaintenanceOperation;
  readonly mode: PmsApiMode;
  readonly severity?: ReportMaintenanceCommand['severity'];
  readonly stopSellRequested?: boolean;
  readonly note?: string;
}

export interface MaintenanceDoneApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsMaintenanceDoneOperation;
  readonly mode: PmsApiMode;
  readonly ticketId?: string;
  readonly note?: string;
}

export interface RestoreSellableApiRequest extends PmsExtendedCommandApiRequestBase {
  readonly operation: typeof pmsRestoreSellableOperation;
  readonly mode: PmsApiMode;
}

export type PmsExtendedCommandApiRequest =
  | HousekeepingDoneApiRequest
  | HousekeepingInspectionApiRequest
  | HousekeepingReworkApiRequest
  | HousekeepingMarkDirtyApiRequest
  | ReportMaintenanceApiRequest
  | MaintenanceDoneApiRequest
  | RestoreSellableApiRequest;

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

export interface PmsExtendedCommandDryRunApiResponse {
  readonly ok: true;
  readonly operation: PmsExtendedCommandApiRequest['operation'];
  readonly mode: 'dryRun';
  readonly request: RequestFingerprintEnvelope;
  readonly plan: import('@pms-platform/contracts').PmsCommandDryRunPlan;
}

export interface PmsExtendedCommandConfirmApiResponse {
  readonly ok: true;
  readonly operation: PmsExtendedCommandApiRequest['operation'];
  readonly mode: 'confirm';
  readonly request: RequestFingerprintEnvelope;
  readonly result: CorePmsCommandConfirmResult;
}

export type PmsExtendedCommandApiResponse =
  | PmsExtendedCommandDryRunApiResponse
  | PmsExtendedCommandConfirmApiResponse
  | StableErrorPassthrough;

export interface StayLifecycleHooks {
  afterCheckInConfirm?(input: { readonly request: CheckInConfirmApiRequest; readonly result: CoreCheckInConfirmResult }): void;
  afterCheckOutConfirm?(input: { readonly request: CheckOutConfirmApiRequest; readonly result: CoreCheckOutConfirmResult }): void;
}

export interface ExecuteCheckOutApiOptions {
  readonly idempotency?: ApiIdempotencyRepository;
  readonly stayLifecycle?: StayLifecycleHooks;
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
  if (response.ok && response.mode === 'confirm') {
    options.stayLifecycle?.afterCheckInConfirm?.({ request: request as CheckInConfirmApiRequest, result: response.result });
  }
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
  if (response.ok && response.mode === 'confirm') {
    options.stayLifecycle?.afterCheckOutConfirm?.({ request: request as CheckOutConfirmApiRequest, result: response.result });
  }
  idempotency?.save({
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    response,
  });
  return response;
}

export function executePmsExtendedCommandApiRequest(
  request: PmsExtendedCommandApiRequest,
  ports: CorePorts,
  options: ExecuteCheckOutApiOptions = {},
): PmsExtendedCommandApiResponse {
  const idempotency = options.idempotency;
  const existing = idempotency?.get(request.idempotencyKey);

  if (existing && existing.requestFingerprint !== request.requestFingerprint) {
    return incompatibleFingerprintResponse(request);
  }

  if (existing) {
    return existing.response as PmsExtendedCommandApiResponse;
  }

  const response = toPmsExtendedCommandApiResponse(request, executeCoreExtendedCommand(request, ports));
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
    ...(request.reservationId ? { reservationId: request.reservationId } : {}),
    ...(request.reservationCode ? { reservationCode: request.reservationCode } : {}),
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
    ...(request.reservationId ? { reservationId: request.reservationId } : {}),
    ...(request.reservationCode ? { reservationCode: request.reservationCode } : {}),
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

export function toPmsExtendedCommand(request: PmsExtendedCommandApiRequest):
  | HousekeepingDoneCommand
  | HousekeepingInspectionCommand
  | HousekeepingReworkCommand
  | HousekeepingMarkDirtyCommand
  | ReportMaintenanceCommand
  | MaintenanceDoneCommand
  | RestoreSellableCommand {
  const meta = {
    actor: { ...request.actor },
    source: request.source,
    reason: request.reason,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    requestedAt: request.requestedAt,
    mode: request.mode,
  };
  if (request.operation === pmsHousekeepingDoneOperation) {
    return { type: 'HOUSEKEEPING_DONE', roomId: request.roomId, inspectionRequired: request.inspectionRequired, meta };
  }
  if (request.operation === pmsHousekeepingInspectionOperation) {
    return { type: 'HOUSEKEEPING_INSPECTION', roomId: request.roomId, result: request.result, taskId: request.taskId, meta };
  }
  if (request.operation === pmsHousekeepingReworkOperation) {
    return { type: 'HOUSEKEEPING_REWORK', roomId: request.roomId, inspectionRequired: request.inspectionRequired, taskId: request.taskId, meta };
  }
  if (request.operation === pmsHousekeepingMarkDirtyOperation) {
    return { type: 'HOUSEKEEPING_MARK_DIRTY', roomId: request.roomId, meta };
  }
  if (request.operation === pmsReportMaintenanceOperation) {
    return {
      type: 'REPORT_MAINTENANCE',
      roomId: request.roomId,
      severity: request.severity,
      stopSellRequested: request.stopSellRequested,
      note: request.note,
      meta,
    };
  }
  if (request.operation === pmsMaintenanceDoneOperation) {
    return { type: 'MAINTENANCE_DONE', roomId: request.roomId, ticketId: request.ticketId, note: request.note, meta };
  }
  return { type: 'RESTORE_SELLABLE', roomId: request.roomId, meta };
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

export function toPmsExtendedCommandApiResponse(
  request: PmsExtendedCommandApiRequest,
  result: PmsCommandResult,
): PmsExtendedCommandApiResponse {
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
      operation: request.operation,
      mode: 'dryRun',
      request: requestEnvelope,
      plan: result.plan,
    };
  }

  return {
    ok: true,
    operation: request.operation,
    mode: 'confirm',
    request: requestEnvelope,
    result: result.result,
  };
}

function executeCoreExtendedCommand(request: PmsExtendedCommandApiRequest, ports: CorePorts): PmsCommandResult {
  const command = toPmsExtendedCommand(request);
  if (command.type === 'HOUSEKEEPING_DONE') return housekeepingDone(command, ports);
  if (command.type === 'HOUSEKEEPING_INSPECTION') return housekeepingInspection(command, ports);
  if (command.type === 'HOUSEKEEPING_REWORK') return housekeepingRework(command, ports);
  if (command.type === 'HOUSEKEEPING_MARK_DIRTY') return housekeepingMarkDirty(command, ports);
  if (command.type === 'REPORT_MAINTENANCE') return reportMaintenance(command, ports);
  if (command.type === 'MAINTENANCE_DONE') return maintenanceDone(command, ports);
  return restoreSellable(command, ports);
}

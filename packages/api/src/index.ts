import type {
  Actor,
  CheckInCommand,
  CheckOutCommand,
  CommandExecutionMode,
  CommandMeta,
  DashboardReadModel,
  DomainError,
  HousekeepingDoneCommand,
  HousekeepingInspectionCommand,
  HousekeepingReworkCommand,
  InventoryHorizonRequest,
  InventoryReadModel,
  OperationRequest,
  OperationRequestSource,
  OperationRequestStatus,
  MaintenanceDoneCommand,
  ReservationReadModel,
  ReportMaintenanceCommand,
  RoomReservationContextReadModel,
  RestoreSellableCommand,
  RoomReadModel,
  TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  checkIn,
  checkOut,
  getDashboardReadModel,
  getRoomReadModel,
  housekeepingDone,
  housekeepingInspection,
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

export const apiPackageName = '@pms-platform/api';
export const pmsCheckInOperation = 'pms_check_in';
export const pmsCheckOutOperation = 'pms_check_out';
export const pmsHousekeepingDoneOperation = 'pms_housekeeping_done';
export const pmsHousekeepingInspectionOperation = 'pms_housekeeping_inspection';
export const pmsHousekeepingReworkOperation = 'pms_housekeeping_rework';
export const pmsReportMaintenanceOperation = 'pms_report_maintenance';
export const pmsMaintenanceDoneOperation = 'pms_maintenance_done';
export const pmsRestoreSellableOperation = 'pms_restore_sellable';
export const pmsGetRoomOperation = 'pms_get_room';
export const pmsDashboardOperation = 'pms_dashboard';
export const pmsReservationGetOperation = 'pms_reservation_get';
export const pmsTodayArrivalsOperation = 'pms_today_arrivals';
export const pmsTodayDeparturesOperation = 'pms_today_departures';
export const pmsRoomReservationContextOperation = 'pms_room_reservation_context';
export const pmsInventoryIntervalsOperation = 'pms_inventory_intervals';
export const pmsInventorySummaryOperation = 'pms_inventory_summary';
export const pmsOperationRequestCreateOperation = 'pms_operation_request_create';
export const pmsOperationRequestGetOperation = 'pms_operation_request_get';
export const pmsOperationRequestUpdateOperation = 'pms_operation_request_update';

export type PmsCommandOperation =
  | typeof pmsCheckInOperation
  | typeof pmsCheckOutOperation
  | typeof pmsHousekeepingDoneOperation
  | typeof pmsHousekeepingInspectionOperation
  | typeof pmsHousekeepingReworkOperation
  | typeof pmsReportMaintenanceOperation
  | typeof pmsMaintenanceDoneOperation
  | typeof pmsRestoreSellableOperation;
export type PmsReadModelOperation =
  | typeof pmsGetRoomOperation
  | typeof pmsDashboardOperation
  | typeof pmsReservationGetOperation
  | typeof pmsTodayArrivalsOperation
  | typeof pmsTodayDeparturesOperation
  | typeof pmsRoomReservationContextOperation
  | typeof pmsInventoryIntervalsOperation
  | typeof pmsInventorySummaryOperation;
export type PmsApiMode = 'dryRun' | 'confirm';
export type CheckOutApiMode = PmsApiMode;
export type PmsOperationRequestOperation =
  | typeof pmsOperationRequestCreateOperation
  | typeof pmsOperationRequestGetOperation
  | typeof pmsOperationRequestUpdateOperation;
export type ApiBoundaryErrorCode =
  | 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'OPERATION_REQUEST_UNSUPPORTED_ACTION'
  | 'OPERATION_REQUEST_UNSUPPORTED_SOURCE'
  | 'OPERATION_REQUEST_NOT_FOUND'
  | 'OPERATION_REQUEST_INVALID_STATUS';
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
  readonly parameters?: Record<string, unknown>;
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
  | ReportMaintenanceApiRequest
  | MaintenanceDoneApiRequest
  | RestoreSellableApiRequest;

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

export interface ReservationGetApiRequest {
  readonly operation: typeof pmsReservationGetOperation;
  readonly reservationCode: string;
  readonly requestedAt: string;
}

export interface ReservationGetApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsReservationGetOperation;
  readonly readModel?: ReservationReadModel;
}

export interface TodayReservationsApiRequest {
  readonly operation: typeof pmsTodayArrivalsOperation | typeof pmsTodayDeparturesOperation;
  readonly businessDate: string;
  readonly requestedAt: string;
}

export interface TodayReservationsApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsTodayArrivalsOperation | typeof pmsTodayDeparturesOperation;
  readonly readModel: TodayReservationsReadModel;
}

export interface RoomReservationContextApiRequest {
  readonly operation: typeof pmsRoomReservationContextOperation;
  readonly roomId: string;
  readonly requestedAt: string;
}

export interface RoomReservationContextApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsRoomReservationContextOperation;
  readonly readModel: RoomReservationContextReadModel;
}

export interface InventoryIntervalsApiRequest extends InventoryHorizonRequest {
  readonly operation: typeof pmsInventoryIntervalsOperation;
}

export interface InventoryIntervalsApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsInventoryIntervalsOperation;
  readonly readModel: InventoryReadModel;
}

export interface InventorySummaryApiRequest extends InventoryHorizonRequest {
  readonly operation: typeof pmsInventorySummaryOperation;
}

export interface InventorySummaryApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsInventorySummaryOperation;
  readonly readModel: InventoryReadModel;
}

export type PmsReadModelApiRequest =
  | GetRoomApiRequest
  | DashboardApiRequest
  | ReservationGetApiRequest
  | TodayReservationsApiRequest
  | RoomReservationContextApiRequest
  | InventoryIntervalsApiRequest
  | InventorySummaryApiRequest;
export type PmsReadModelApiResponse =
  | GetRoomApiResponse
  | DashboardApiResponse
  | ReservationGetApiResponse
  | TodayReservationsApiResponse
  | RoomReservationContextApiResponse
  | InventoryIntervalsApiResponse
  | InventorySummaryApiResponse;

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

export interface OperationRequestUpdateApiSuccessResponse {
  readonly ok: true;
  readonly operation: typeof pmsOperationRequestUpdateOperation;
  readonly request: OperationRequest;
}

export type OperationRequestCreateApiResponse = OperationRequestCreateApiSuccessResponse | OperationRequestApiErrorResponse;
export type OperationRequestUpdateApiResponse = OperationRequestUpdateApiSuccessResponse | OperationRequestApiErrorResponse;

export interface ApiIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly response: CheckInApiResponse | CheckOutApiResponse | PmsExtendedCommandApiResponse;
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

export function toPmsExtendedCommand(request: PmsExtendedCommandApiRequest):
  | HousekeepingDoneCommand
  | HousekeepingInspectionCommand
  | HousekeepingReworkCommand
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
    operations: [
      pmsCheckInOperation,
      pmsCheckOutOperation,
      pmsHousekeepingDoneOperation,
      pmsHousekeepingInspectionOperation,
      pmsHousekeepingReworkOperation,
      pmsReportMaintenanceOperation,
      pmsMaintenanceDoneOperation,
      pmsRestoreSellableOperation,
      pmsGetRoomOperation,
      pmsDashboardOperation,
      pmsReservationGetOperation,
      pmsTodayArrivalsOperation,
      pmsTodayDeparturesOperation,
      pmsRoomReservationContextOperation,
      pmsInventoryIntervalsOperation,
      pmsInventorySummaryOperation,
      pmsOperationRequestCreateOperation,
      pmsOperationRequestGetOperation,
      pmsOperationRequestUpdateOperation,
    ] as const,
    importsCoreResult: true,
    exposesLocalHandler: true,
    supportedModes: ['dryRun', 'confirm'] as const,
  };
}

function executeCoreExtendedCommand(request: PmsExtendedCommandApiRequest, ports: CorePorts): PmsCommandResult {
  const command = toPmsExtendedCommand(request);
  if (command.type === 'HOUSEKEEPING_DONE') return housekeepingDone(command, ports);
  if (command.type === 'HOUSEKEEPING_INSPECTION') return housekeepingInspection(command, ports);
  if (command.type === 'HOUSEKEEPING_REWORK') return housekeepingRework(command, ports);
  if (command.type === 'REPORT_MAINTENANCE') return reportMaintenance(command, ports);
  if (command.type === 'MAINTENANCE_DONE') return maintenanceDone(command, ports);
  return restoreSellable(command, ports);
}

function extendedFingerprintParameters(
  request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest,
): { readonly parameters?: Record<string, unknown> } {
  if (request.operation === pmsCheckInOperation || request.operation === pmsCheckOutOperation) {
    return {};
  }
  const record = request as unknown as Record<string, unknown>;
  const parameters: Record<string, unknown> = {};
  for (const key of ['inspectionRequired', 'result', 'taskId', 'severity', 'stopSellRequested', 'note', 'ticketId'] as const) {
    if (record[key] !== undefined) {
      parameters[key] = record[key];
    }
  }
  return Object.keys(parameters).length > 0 ? { parameters } : {};
}

function incompatibleFingerprintResponse(request: CheckInApiRequest | CheckOutApiRequest | PmsExtendedCommandApiRequest): StableErrorPassthrough {
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

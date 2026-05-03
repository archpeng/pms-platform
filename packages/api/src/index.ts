import type {
  Actor,
  AvailabilityRoomCandidate,
  AvailabilitySearchReadModel,
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
  PendingActionCallbackIdempotencyStatus,
  PendingActionCallbackOperation,
  PendingActionReadModel,
  PendingActionScopeRef,
  PmsCapabilityClass,
  ReservationDraftEvidenceRef,
  ReservationDraftMissingSlot,
  ReservationDraftSlots,
  ReservationDraftWorkflowOperation,
  ReservationDraftWorkflowRef,
  ReservationDraftWorkflowSafeGap,
  PmsCapabilityManifest,
  PmsCapabilityManifestItem,
  PmsCapabilityPlannerProjection,
  PmsCapabilityPlannerProjectionItem,
  MaintenanceDoneCommand,
  ReservationReadModel,
  ReportMaintenanceCommand,
  RoomReservationContextReadModel,
  RestoreSellableCommand,
  RoomReadModel,
  TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  reservationDraftCancelOperationName,
  reservationDraftCreateOperationName,
  reservationDraftUpdateOperationName,
  reservationPrepareConfirmOperationName,
  reservationQuoteOperationName,
  pendingActionCancelOperationName,
  pendingActionConfirmOperationName,
  pendingActionStatusOperationName,
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
export const pmsAvailabilitySearchOperation = 'pms_availability_search';
export const pmsReservationDraftCreateOperation = reservationDraftCreateOperationName;
export const pmsReservationDraftUpdateOperation = reservationDraftUpdateOperationName;
export const pmsReservationQuoteOperation = reservationQuoteOperationName;
export const pmsReservationPrepareConfirmOperation = reservationPrepareConfirmOperationName;
export const pmsReservationDraftCancelOperation = reservationDraftCancelOperationName;
export const pmsPendingActionStatusOperation = pendingActionStatusOperationName;
export const pmsPendingActionConfirmOperation = pendingActionConfirmOperationName;
export const pmsPendingActionCancelOperation = pendingActionCancelOperationName;
export const pmsOperationRequestCreateOperation = 'pms_operation_request_create';
export const pmsOperationRequestGetOperation = 'pms_operation_request_get';
export const pmsOperationRequestListOperation = 'pms_operation_request_list';
export const pmsOperationRequestUpdateOperation = 'pms_operation_request_update';
export const pmsCapabilityManifestOperation = 'pms_capabilities_manifest';

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
  | typeof pmsInventorySummaryOperation
  | typeof pmsAvailabilitySearchOperation;
export type PmsApiMode = 'dryRun' | 'confirm';
export type CheckOutApiMode = PmsApiMode;
export type PmsReservationDraftWorkflowOperation = ReservationDraftWorkflowOperation;
export type PmsPendingActionOperation = PendingActionCallbackOperation;
export type PmsOperationRequestOperation =
  | typeof pmsOperationRequestCreateOperation
  | typeof pmsOperationRequestGetOperation
  | typeof pmsOperationRequestListOperation
  | typeof pmsOperationRequestUpdateOperation;
export type ApiBoundaryErrorCode =
  | 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'RESERVATION_DRAFT_NOT_FOUND'
  | 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS'
  | 'RESERVATION_DRAFT_NOT_ACTIVE'
  | 'RESERVATION_DRAFT_EXPIRED'
  | 'RESERVATION_DRAFT_QUOTE_REQUIRED'
  | 'RESERVATION_DRAFT_QUOTE_MISMATCH'
  | 'RESERVATION_DRAFT_WORKFLOW_NOT_IMPLEMENTED'
  | 'RESERVATION_QUOTE_PRICING_UNSUPPORTED'
  | 'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'OPERATION_REQUEST_UNSUPPORTED_ACTION'
  | 'OPERATION_REQUEST_UNSUPPORTED_SOURCE'
  | 'OPERATION_REQUEST_NOT_FOUND'
  | 'OPERATION_REQUEST_INVALID_STATUS'
  | 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT'
  | 'PENDING_ACTION_NOT_FOUND'
  | 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH'
  | 'PENDING_ACTION_NOT_ACTIVE'
  | 'PENDING_ACTION_EXPIRED';
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

export interface AvailabilitySearchApiRequest {
  readonly operation: typeof pmsAvailabilitySearchOperation;
  readonly startDate: string;
  readonly endDate?: string;
  readonly horizonDays?: number;
  readonly roomTypeId?: string;
  readonly roomTypeKeyword?: string;
  readonly capacity?: number;
  readonly count?: number;
  readonly requestedAt: string;
}

export interface AvailabilitySearchApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsAvailabilitySearchOperation;
  readonly readModel: AvailabilitySearchReadModel;
}

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

export type PmsReadModelApiRequest =
  | GetRoomApiRequest
  | DashboardApiRequest
  | ReservationGetApiRequest
  | TodayReservationsApiRequest
  | RoomReservationContextApiRequest
  | InventoryIntervalsApiRequest
  | InventorySummaryApiRequest
  | AvailabilitySearchApiRequest;
export type PmsReadModelApiResponse =
  | GetRoomApiResponse
  | DashboardApiResponse
  | ReservationGetApiResponse
  | TodayReservationsApiResponse
  | RoomReservationContextApiResponse
  | InventoryIntervalsApiResponse
  | InventorySummaryApiResponse
  | AvailabilitySearchApiResponse;

export interface PendingActionCallbackApiRequestBase {
  readonly operation?: PmsPendingActionOperation;
  readonly pendingActionRef: string;
  readonly actor: Actor;
  readonly scope: PendingActionScopeRef;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly cardPayloadRef?: string;
}

export interface PendingActionStatusApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionStatusOperation;
}

export interface PendingActionConfirmApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionConfirmOperation;
}

export interface PendingActionCancelApiRequest extends PendingActionCallbackApiRequestBase {
  readonly operation?: typeof pmsPendingActionCancelOperation;
  readonly reason: string;
}

export type PendingActionCallbackApiRequest = PendingActionStatusApiRequest | PendingActionConfirmApiRequest | PendingActionCancelApiRequest;

export interface PendingActionCallbackSuccessApiResponse {
  readonly ok: true;
  readonly operation: PmsPendingActionOperation;
  readonly status: 'ok';
  readonly mutationStatus: 'none' | 'deferred';
  readonly idempotencyStatus: PendingActionCallbackIdempotencyStatus;
  readonly pendingAction: PendingActionReadModel;
}

export interface PendingActionCallbackErrorApiResponse {
  readonly ok: false;
  readonly operation: PmsPendingActionOperation;
  readonly status: 'notFound' | 'rejected';
  readonly mutationStatus: 'none';
  readonly pendingAction?: PendingActionReadModel;
  readonly errors: readonly ApiError[];
}

export type PendingActionCallbackApiResponse = PendingActionCallbackSuccessApiResponse | PendingActionCallbackErrorApiResponse;

export interface PendingActionLifecycleStore {
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse;
  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse;
  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse;
}

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

export interface ApiIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly response: CheckInApiResponse | CheckOutApiResponse | PmsExtendedCommandApiResponse | ReservationDraftWorkflowApiResponse | PendingActionCallbackApiResponse;
}

export interface ApiIdempotencyRepository {
  get(idempotencyKey: string): ApiIdempotencyRecord | undefined;
  save(record: ApiIdempotencyRecord): void;
  list(): readonly ApiIdempotencyRecord[];
}

export interface StayLifecycleHooks {
  afterCheckInConfirm?(input: { readonly request: CheckInConfirmApiRequest; readonly result: CoreCheckInConfirmResult }): void;
  afterCheckOutConfirm?(input: { readonly request: CheckOutConfirmApiRequest; readonly result: CoreCheckOutConfirmResult }): void;
}

export interface ExecuteCheckOutApiOptions {
  readonly idempotency?: ApiIdempotencyRepository;
  readonly stayLifecycle?: StayLifecycleHooks;
}

export type ExecuteCheckInApiOptions = ExecuteCheckOutApiOptions;

export function getPmsCapabilityManifest(generatedAt = new Date().toISOString()): PmsCapabilityManifest {
  const capabilities = buildPmsCapabilityManifestItems();
  return {
    schemaVersion: 'pms-capability-manifest-v1',
    generatedAt,
    capabilities,
    plannerProjection: getPmsCapabilityPlannerProjection(capabilities),
  };
}

export function getPmsCapabilityPlannerProjection(
  capabilities: readonly PmsCapabilityManifestItem[],
): PmsCapabilityPlannerProjection {
  return {
    schemaVersion: 'pms-capability-planner-projection-v1',
    capabilities: capabilities
      .filter((capability) =>
        capability.customerChatAllowed &&
        capability.naturalLanguageExecutable &&
        !capability.confirmationRequired &&
        capability.class !== 'confirm' &&
        capability.class !== 'internal'
      )
      .map(({ endpoint: _endpoint, ...capability }): PmsCapabilityPlannerProjectionItem => capability),
  };
}

function buildPmsCapabilityManifestItems(): readonly PmsCapabilityManifestItem[] {
  return [
    readCapability(pmsGetRoomOperation, '/v1/pms/room', 'GetRoomApiRequest', 'GetRoomApiResponse', [{ name: 'roomId', required: true, source: 'user' }], 'RoomReadModel'),
    readCapability(pmsDashboardOperation, '/v1/pms/dashboard', 'DashboardApiRequest', 'DashboardApiResponse', [], 'DashboardReadModel'),
    readCapability(pmsReservationGetOperation, '/v1/pms/reservations/get', 'ReservationGetApiRequest', 'ReservationGetApiResponse', [{ name: 'reservationCode', required: true, source: 'user' }], 'ReservationReadModel'),
    readCapability(pmsTodayArrivalsOperation, '/v1/pms/reservations/today-arrivals', 'TodayReservationsApiRequest', 'TodayReservationsApiResponse', [{ name: 'businessDate', required: true, source: 'user' }], 'TodayReservationsReadModel'),
    readCapability(pmsTodayDeparturesOperation, '/v1/pms/reservations/today-departures', 'TodayReservationsApiRequest', 'TodayReservationsApiResponse', [{ name: 'businessDate', required: true, source: 'user' }], 'TodayReservationsReadModel'),
    readCapability(pmsRoomReservationContextOperation, '/v1/pms/room/reservation-context', 'RoomReservationContextApiRequest', 'RoomReservationContextApiResponse', [{ name: 'roomId', required: true, source: 'user' }], 'RoomReservationContextReadModel'),
    readCapability(pmsInventoryIntervalsOperation, '/v1/pms/inventory/intervals', 'InventoryIntervalsApiRequest', 'InventoryIntervalsApiResponse', [], 'InventoryReadModel'),
    readCapability(pmsInventorySummaryOperation, '/v1/pms/inventory/summary', 'InventorySummaryApiRequest', 'InventorySummaryApiResponse', [], 'InventoryReadModel'),
    readCapability(pmsAvailabilitySearchOperation, '/v1/pms/availability/search', 'AvailabilitySearchApiRequest', 'AvailabilitySearchApiResponse', [
      { name: 'startDate', required: true, source: 'user' },
      { name: 'endDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
      { name: 'capacity', required: false, source: 'user' },
      { name: 'count', required: false, source: 'user' },
    ], 'AvailabilitySearchReadModel'),
    reservationDraftCapability(pmsReservationDraftCreateOperation, '/v1/pms/reservation-drafts/create', 'draft', 'ReservationDraftCreateApiRequest', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'guestDisplayName', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationDraftUpdateOperation, '/v1/pms/reservation-drafts/update', 'draft', 'ReservationDraftUpdateApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'guestDisplayName', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationQuoteOperation, '/v1/pms/reservation-drafts/quote', 'draft', 'ReservationQuoteApiRequest', [
      { name: 'draftRef', required: false, source: 'context' },
      { name: 'selectedCandidateRef', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationPrepareConfirmOperation, '/v1/pms/reservation-drafts/prepare-confirm', 'prepareConfirm', 'ReservationPrepareConfirmApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'quoteRef', required: false, source: 'context' },
    ]),
    reservationDraftCapability(pmsReservationDraftCancelOperation, '/v1/pms/reservation-drafts/cancel', 'draft', 'ReservationDraftCancelApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'reason', required: true, source: 'user' },
    ]),
    readCapability(pmsOperationRequestGetOperation, '/v1/pms/operation-requests/get', 'OperationRequestGetApiRequest', 'OperationRequestGetApiResponse', [{ name: 'operationRequestId', required: false, source: 'context' }], 'OperationRequest'),
    readCapability(pmsOperationRequestListOperation, '/v1/pms/operation-requests/list', 'OperationRequestListApiRequest', 'OperationRequestListApiResponse', [], 'OperationRequest'),
    commandCapability(pmsCheckInOperation, 'CHECK_IN', '/v1/pms/check-in', 'dryRun', ['RoomCheckedIn'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'reservationCode', required: false, source: 'user' }]),
    commandCapability(pmsCheckInOperation, 'CHECK_IN', '/v1/pms/check-in', 'confirm', ['RoomCheckedIn'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'reservationCode', required: false, source: 'user' }]),
    commandCapability(pmsCheckOutOperation, 'CHECK_OUT', '/v1/pms/check-out', 'dryRun', ['RoomCheckedOut', 'HousekeepingTaskCreated'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsCheckOutOperation, 'CHECK_OUT', '/v1/pms/check-out', 'confirm', ['RoomCheckedOut', 'HousekeepingTaskCreated'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingDoneOperation, 'HOUSEKEEPING_DONE', '/v1/pms/housekeeping/done', 'dryRun', ['HousekeepingCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingDoneOperation, 'HOUSEKEEPING_DONE', '/v1/pms/housekeeping/done', 'confirm', ['HousekeepingCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingInspectionOperation, 'HOUSEKEEPING_INSPECTION', '/v1/pms/housekeeping/inspection', 'dryRun', ['HousekeepingInspectionPassed', 'HousekeepingInspectionFailed'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'result', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingInspectionOperation, 'HOUSEKEEPING_INSPECTION', '/v1/pms/housekeeping/inspection', 'confirm', ['HousekeepingInspectionPassed', 'HousekeepingInspectionFailed'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'result', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingReworkOperation, 'HOUSEKEEPING_REWORK', '/v1/pms/housekeeping/rework', 'dryRun', ['HousekeepingReworkCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingReworkOperation, 'HOUSEKEEPING_REWORK', '/v1/pms/housekeeping/rework', 'confirm', ['HousekeepingReworkCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsReportMaintenanceOperation, 'REPORT_MAINTENANCE', '/v1/pms/maintenance/report', 'dryRun', ['MaintenanceReported'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'severity', required: false, source: 'user' }]),
    commandCapability(pmsReportMaintenanceOperation, 'REPORT_MAINTENANCE', '/v1/pms/maintenance/report', 'confirm', ['MaintenanceReported'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'severity', required: false, source: 'user' }]),
    commandCapability(pmsMaintenanceDoneOperation, 'MAINTENANCE_DONE', '/v1/pms/maintenance/done', 'dryRun', ['MaintenanceCompleted'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'ticketId', required: false, source: 'context' }]),
    commandCapability(pmsMaintenanceDoneOperation, 'MAINTENANCE_DONE', '/v1/pms/maintenance/done', 'confirm', ['MaintenanceCompleted'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'ticketId', required: false, source: 'context' }]),
    commandCapability(pmsRestoreSellableOperation, 'RESTORE_SELLABLE', '/v1/pms/maintenance/restore-sellable', 'dryRun', ['RoomSellabilityRestored'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsRestoreSellableOperation, 'RESTORE_SELLABLE', '/v1/pms/maintenance/restore-sellable', 'confirm', ['RoomSellabilityRestored'], [{ name: 'roomId', required: true, source: 'user' }]),
    operationRequestSafeIntakeCapability({
      operation: pmsOperationRequestCreateOperation,
      path: '/v1/pms/operation-requests/create',
      requestSchemaRef: 'OperationRequestCreateApiRequest',
      responseSchemaRef: 'OperationRequestCreateApiResponse',
      customerChatAllowed: true,
      naturalLanguageExecutable: true,
      slots: [{ name: 'action', required: true, source: 'user' }],
      idempotency: { required: true, keyField: 'clientToken', fingerprintRequired: true, replaySafe: true },
    }),
    operationRequestSafeIntakeCapability({
      operation: pmsOperationRequestUpdateOperation,
      path: '/v1/pms/operation-requests/update',
      requestSchemaRef: 'OperationRequestUpdateApiRequest',
      responseSchemaRef: 'OperationRequestUpdateApiResponse',
      customerChatAllowed: false,
      naturalLanguageExecutable: false,
      slots: [
        { name: 'operationRequestId', required: false, source: 'context' },
        { name: 'clientToken', required: false, source: 'context' },
        { name: 'status', required: false, source: 'system' },
      ],
      idempotency: { required: false, fingerprintRequired: false, replaySafe: false },
    }),
    internalCapability(pmsPendingActionStatusOperation, 'POST', '/v1/pms/pending-actions/status', 'PendingActionStatusApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsPendingActionConfirmOperation, 'POST', '/v1/pms/pending-actions/confirm', 'PendingActionConfirmApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsPendingActionCancelOperation, 'POST', '/v1/pms/pending-actions/cancel', 'PendingActionCancelApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsCapabilityManifestOperation, 'GET', '/v1/pms/capabilities/manifest', undefined, 'PmsCapabilityManifest'),
    internalCapability('pms_sandbox_readback', 'GET', '/v1/sandbox/readback', undefined, 'PmsSandboxReadback'),
    internalCapability('pms_sandbox_reset', 'POST', '/v1/sandbox/reset', undefined, 'PmsSandboxReadback'),
  ];
}

function reservationDraftCapability(
  operation: PmsReservationDraftWorkflowOperation,
  path: string,
  capabilityClass: Extract<PmsCapabilityClass, 'draft' | 'prepareConfirm'>,
  requestSchemaRef: string,
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: capabilityClass,
    customerChatAllowed: true,
    naturalLanguageExecutable: true,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: 'ReservationDraftWorkflowApiResponse' },
    slots,
    refs: { workflow: 'reservationDraft' },
    idempotency: { required: true, keyField: 'clientToken', fingerprintRequired: true, replaySafe: true },
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path, operation, auth: 'bearer-token' },
  });
}

function readCapability(
  operation: string,
  path: string,
  requestSchemaRef: string,
  responseSchemaRef: string,
  slots: PmsCapabilityManifestItem['slots'],
  readModel: string,
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: 'read',
    customerChatAllowed: true,
    naturalLanguageExecutable: true,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: responseSchemaRef },
    slots,
    refs: { readModel },
    idempotency: { required: false, fingerprintRequired: false, replaySafe: true },
    audit: { auditRequired: false, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path, operation, auth: 'bearer-token' },
  });
}

function operationRequestSafeIntakeCapability(options: {
  readonly operation: PmsOperationRequestOperation;
  readonly path: string;
  readonly requestSchemaRef: string;
  readonly responseSchemaRef: string;
  readonly customerChatAllowed: boolean;
  readonly naturalLanguageExecutable: boolean;
  readonly slots: PmsCapabilityManifestItem['slots'];
  readonly idempotency: PmsCapabilityManifestItem['idempotency'];
}): PmsCapabilityManifestItem {
  return capability({
    name: options.operation,
    class: 'safeIntake',
    customerChatAllowed: options.customerChatAllowed,
    naturalLanguageExecutable: options.naturalLanguageExecutable,
    confirmationRequired: false,
    schemaRefs: { request: options.requestSchemaRef, response: options.responseSchemaRef },
    slots: options.slots,
    refs: { readModel: 'OperationRequest' },
    idempotency: options.idempotency,
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path: options.path, operation: options.operation, auth: 'bearer-token' },
  });
}

function commandCapability(
  operation: PmsCommandOperation,
  commandType: PmsCapabilityManifestItem['refs']['commandType'],
  path: string,
  mode: PmsApiMode,
  eventTypes: readonly string[],
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  const isConfirm = mode === 'confirm';
  return capability({
    name: `${operation}.${mode}`,
    class: isConfirm ? 'confirm' : 'dryRun',
    customerChatAllowed: !isConfirm,
    naturalLanguageExecutable: !isConfirm,
    confirmationRequired: isConfirm,
    schemaRefs: { request: `${commandSchemaStem(operation)}${isConfirm ? 'Confirm' : 'DryRun'}ApiRequest`, response: `${commandSchemaStem(operation)}ApiResponse` },
    slots,
    refs: { commandType, domainEvents: eventTypes },
    idempotency: { required: true, keyField: 'idempotencyKey', fingerprintRequired: true, replaySafe: true },
    audit: { auditRequired: isConfirm, emitsDomainEvents: isConfirm, eventTypes: isConfirm ? eventTypes : [] },
    endpoint: { method: 'POST', path, operation, mode, auth: 'bearer-token' },
  });
}

function commandSchemaStem(operation: PmsCommandOperation): string {
  if (operation === pmsCheckInOperation) return 'CheckIn';
  if (operation === pmsCheckOutOperation) return 'CheckOut';
  if (operation === pmsHousekeepingDoneOperation) return 'HousekeepingDone';
  if (operation === pmsHousekeepingInspectionOperation) return 'HousekeepingInspection';
  if (operation === pmsHousekeepingReworkOperation) return 'HousekeepingRework';
  if (operation === pmsReportMaintenanceOperation) return 'ReportMaintenance';
  if (operation === pmsMaintenanceDoneOperation) return 'MaintenanceDone';
  return 'RestoreSellable';
}

function internalCapability(
  operation: string,
  method: PmsCapabilityManifestItem['endpoint']['method'],
  path: string,
  requestSchemaRef: string | undefined,
  responseSchemaRef: string,
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: 'internal',
    customerChatAllowed: false,
    naturalLanguageExecutable: false,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: responseSchemaRef },
    slots: [],
    refs: {},
    idempotency: { required: false, fingerprintRequired: false, replaySafe: false },
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method, path, operation, auth: 'bearer-token' },
  });
}

function capability(options: {
  readonly name: string;
  readonly class: PmsCapabilityClass;
  readonly customerChatAllowed: boolean;
  readonly naturalLanguageExecutable: boolean;
  readonly confirmationRequired: boolean;
  readonly schemaRefs: PmsCapabilityManifestItem['schemaRefs'];
  readonly slots: PmsCapabilityManifestItem['slots'];
  readonly refs: PmsCapabilityManifestItem['refs'];
  readonly idempotency: PmsCapabilityManifestItem['idempotency'];
  readonly audit: PmsCapabilityManifestItem['audit'];
  readonly endpoint: PmsCapabilityManifestItem['endpoint'];
}): PmsCapabilityManifestItem {
  return {
    version: 'v1',
    ...options,
  };
}

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

export function executeAvailabilitySearchApiRequest(
  request: AvailabilitySearchApiRequest,
  inventory: InventoryReadModel,
): AvailabilitySearchApiResponse {
  const requestedDates = dateRange(request.startDate, request.endDate ?? addBusinessDays(request.startDate, 1));
  const unsupportedFilters = request.capacity === undefined ? [] as const : ['capacity'] as const;
  const count = positiveIntegerOrUndefined(request.count);
  const candidates = unsupportedFilters.length > 0
    ? []
    : findAvailabilityCandidates(inventory, requestedDates, request).slice(0, count);

  return {
    ok: true,
    operation: pmsAvailabilitySearchOperation,
    readModel: {
      schemaVersion: inventory.schemaVersion,
      generatedAt: request.requestedAt,
      summaryStatus: inventory.summaryStatus,
      request: {
        startDate: request.startDate,
        endDate: request.endDate ?? addBusinessDays(request.startDate, 1),
        ...(request.roomTypeId ? { roomTypeId: request.roomTypeId } : {}),
        ...(request.roomTypeKeyword ? { roomTypeKeyword: request.roomTypeKeyword } : {}),
        ...(count ? { count } : {}),
        unsupportedFilters,
      },
      candidates,
      candidateCount: candidates.length,
      truncated: count !== undefined && findAvailabilityCandidates(inventory, requestedDates, request).length > candidates.length,
      projectionFreshness: inventory.projectionFreshness,
    },
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

function findAvailabilityCandidates(
  inventory: InventoryReadModel,
  requestedDates: readonly string[],
  request: AvailabilitySearchApiRequest,
): readonly AvailabilityRoomCandidate[] {
  const byRoom = new Map<string, typeof inventory.dayRooms>();
  for (const dayRoom of inventory.dayRooms) {
    if (!requestedDates.includes(dayRoom.businessDate)) continue;
    if (request.roomTypeId && dayRoom.roomTypeId !== request.roomTypeId) continue;
    if (request.roomTypeKeyword && !matchesRoomTypeKeyword(dayRoom, request.roomTypeKeyword)) continue;
    byRoom.set(dayRoom.roomId, [...(byRoom.get(dayRoom.roomId) ?? []), dayRoom]);
  }

  return Array.from(byRoom.values())
    .filter((dayRooms) => dayRooms.length === requestedDates.length)
    .filter((dayRooms) => dayRooms.every((dayRoom) => dayRoom.availabilityStatus === 'available'))
    .map((dayRooms) => {
      const first = dayRooms[0]!;
      return {
        roomId: first.roomId,
        roomNumber: first.roomNumber,
        propertyId: first.propertyId,
        ...(first.roomTypeId ? { roomTypeId: first.roomTypeId } : {}),
        ...(first.roomType ? { roomType: first.roomType } : {}),
        availableDates: dayRooms.map((dayRoom) => dayRoom.businessDate).sort(),
        sourceRefs: dayRooms.flatMap((dayRoom) => dayRoom.sourceRefs),
      };
    })
    .sort((left, right) => left.roomNumber.localeCompare(right.roomNumber));
}

function matchesRoomTypeKeyword(dayRoom: InventoryReadModel['dayRooms'][number], keyword: string): boolean {
  const needle = keyword.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [dayRoom.roomTypeId, dayRoom.roomType, dayRoom.roomNumber]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

function dateRange(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  for (let cursor = startDate; cursor < endDate; cursor = addBusinessDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > 90) break;
  }
  return dates.length > 0 ? dates : [startDate];
}

function addBusinessDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function positiveIntegerOrUndefined(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value > 0 ? value : undefined;
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
      pmsAvailabilitySearchOperation,
      pmsReservationDraftCreateOperation,
      pmsReservationDraftUpdateOperation,
      pmsReservationQuoteOperation,
      pmsReservationPrepareConfirmOperation,
      pmsReservationDraftCancelOperation,
      pmsPendingActionStatusOperation,
      pmsPendingActionConfirmOperation,
      pmsPendingActionCancelOperation,
      pmsOperationRequestCreateOperation,
      pmsOperationRequestGetOperation,
      pmsOperationRequestListOperation,
      pmsOperationRequestUpdateOperation,
      pmsCapabilityManifestOperation,
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

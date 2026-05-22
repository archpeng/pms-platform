import type {
AuditEntry,
DomainEvent,
HousekeepingTask,
InventoryBlock,
InventoryDayRoom,
InventoryHorizonRequest,
InventoryIntervalProjection,
InventoryReadModel,
InventorySummaryDayType,
HotelProfileReadModel,
MaintenanceTicket,
OperationRequest,
ProjectionOutboxEntry,
ReservationDraftAuditRef,
ReservationDraftWorkflowRef,
ReservationGroupDraftAuditRef,
ReservationGroupDraftWorkflowRef,
ReservationReadModel,
ReservationSearchQuery,
ReservationSearchReadModel,
RoomReservationContextReadModel,
RoomTypeCatalogReadModel,
StayReadModel,
StayStatus,
TodayReservationsReadModel,
} from '@pms-platform/contracts';
import type {
CoreCheckInConfirmResult,
CoreCheckOutConfirmResult,
CorePorts,
RoomAggregate,
} from '@pms-platform/core';
import type { Server } from 'node:http';
import type {
ApiIdempotencyRepository,
CheckInApiRequest,
CheckInConfirmApiRequest,
CheckOutApiRequest,
CheckOutConfirmApiRequest,
OperationRequestCreateApiRequest,
OperationRequestCreateApiResponse,
OperationRequestGetApiRequest,
OperationRequestGetApiResponse,
OperationRequestListApiRequest,
OperationRequestListApiResponse,
OperationRequestUpdateApiRequest,
OperationRequestUpdateApiResponse,
PendingActionCallbackApiResponse,
PendingActionCancelApiRequest,
PendingActionConfirmApiRequest,
PendingActionStatusApiRequest,
PmsExtendedCommandApiRequest,
ReservationDraftLifecycleStore,
ReservationDraftWorkflowApiRequest,
ReservationCancelLifecycleStore,
ReservationGroupDraftLifecycleStore,
ReservationGroupDraftWorkflowApiRequest,
} from '../index.js';
import {
pmsCheckInOperation,
pmsCheckOutOperation,
pmsPendingActionCancelOperation,
pmsPendingActionConfirmOperation,
pmsPendingActionStatusOperation,
pmsReservationCancelPrepareOperation,
} from '../operations.js';

export const pmsLocalAuthTokenEnvName = 'PMS_PLATFORM_LOCAL_AUTH_TOKEN';
export const pmsSqliteDbPathEnvName = 'PMS_PLATFORM_SQLITE_DB_PATH';
export const pmsSandboxStateVersion = 'pms-checkout-local-sandbox-state-v1';

export type PmsLocalStorageKind = 'sqlite';

export interface PmsSandboxPropertyReadback {
  readonly propertyId: string;
  readonly propertyCode: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly status: string;
}

export interface PmsSandboxRoomTypeReadback {
  readonly roomTypeId: string;
  readonly propertyId: string;
  readonly roomTypeCode: string;
  readonly displayName: string;
  readonly sortKey: string;
  readonly status: string;
}

export interface PmsSandboxReservationAllocationReadback {
  readonly allocationId: string;
  readonly reservationId: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
}

export interface PmsSandboxStayReadback extends Omit<StayReadModel, 'projectionFreshness'> {}

export interface PmsSandboxReservationImportRecord {
  readonly reservationId: string;
  readonly reservationCode: string;
  readonly propertyId: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly guestDisplayName: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly status: ReservationReadModel['status'];
  readonly allocation?: {
    readonly allocationId?: string;
    readonly roomId?: string;
    readonly roomNumber?: string;
    readonly roomTypeId?: string;
    readonly roomType?: string;
    readonly startDate?: string;
    readonly endDate?: string;
    readonly status?: string;
  };
  readonly stay?: {
    readonly stayId?: string;
    readonly roomId?: string;
    readonly roomNumber?: string;
    readonly checkedInAt?: string;
    readonly checkedOutAt?: string;
    readonly status?: StayStatus;
  };
}

export interface PmsSandboxReservationImportResult {
  readonly importedCount: number;
  readonly reservations: readonly ReservationReadModel[];
}

export interface PmsLocalStorageMetadata {
  readonly kind: PmsLocalStorageKind;
  readonly envName: string;
  readonly driver?: string;
  readonly experimental?: boolean;
}

export interface PmsSandboxReadback {
  readonly ok: true;
  readonly service: 'pms-platform';
  readonly stateVersion: typeof pmsSandboxStateVersion;
  readonly generatedAt: string;
  readonly storage: PmsLocalStorageMetadata;
  readonly filter: {
    readonly roomId?: string;
  };
  readonly properties: readonly PmsSandboxPropertyReadback[];
  readonly roomTypes: readonly PmsSandboxRoomTypeReadback[];
  readonly rooms: readonly RoomAggregate[];
  readonly reservations: readonly ReservationReadModel[];
  readonly reservationAllocations: readonly PmsSandboxReservationAllocationReadback[];
  readonly stays: readonly PmsSandboxStayReadback[];
  readonly inventoryBlocks: readonly InventoryBlock[];
  readonly inventoryDayRooms: readonly InventoryDayRoom[];
  readonly inventoryIntervalProjection: readonly InventoryIntervalProjection[];
  readonly inventorySummaryDayType: readonly InventorySummaryDayType[];
  readonly reservationDrafts: readonly ReservationDraftWorkflowRef[];
  readonly reservationGroupDrafts: readonly ReservationGroupDraftWorkflowRef[];
  readonly reservationDraftAudits: readonly ReservationDraftAuditRef[];
  readonly reservationGroupDraftAudits: readonly ReservationGroupDraftAuditRef[];
  readonly operationRequests: readonly OperationRequest[];
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly maintenanceTickets: readonly MaintenanceTicket[];
  readonly audits: readonly AuditEntry[];
  readonly domainEvents: readonly DomainEvent[];
  readonly projectionOutbox: readonly ProjectionOutboxEntry[];
  readonly idempotencyRecords: readonly PmsSandboxIdempotencyReadback[];
}

export interface PmsSandboxIdempotencyReadback {
  readonly operation: typeof pmsCheckInOperation | typeof pmsCheckOutOperation | PmsExtendedCommandApiRequest['operation'] | ReservationDraftWorkflowApiRequest['operation'] | ReservationGroupDraftWorkflowApiRequest['operation'] | typeof pmsReservationCancelPrepareOperation | typeof pmsPendingActionStatusOperation | typeof pmsPendingActionConfirmOperation | typeof pmsPendingActionCancelOperation | 'unknown';
  readonly mode: CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | PmsExtendedCommandApiRequest['mode'] | 'draft' | 'unknown';
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly ok: boolean;
}

export type ProjectionDispatchStatus = 'pending' | 'delivered' | 'retryable' | 'failed' | 'skipped';

export interface ProjectionDispatchLedgerEntry {
  readonly outboxEntryId: string;
  readonly status: ProjectionDispatchStatus;
  readonly attemptCount: number;
  readonly adapterOperation?: string;
  readonly adapterStatusCode?: number;
  readonly lastAttemptAt?: string;
  readonly nextAttemptAt?: string;
  readonly redactedError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectionDispatchAuditPayload {
  readonly auditId: string;
  readonly action: ReservationDraftAuditRef['action'];
  readonly occurredAt: string;
  readonly payload: unknown;
}

export interface ProjectionDispatchWorkflowDraft {
  readonly workflowType: 'reservation' | 'reservationGroup';
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly draft?: ReservationDraftWorkflowRef;
  readonly groupDraft?: ReservationGroupDraftWorkflowRef;
}

export interface ProjectionDispatchWorkItem {
  readonly entry: ProjectionOutboxEntry;
  readonly ledger: ProjectionDispatchLedgerEntry;
  readonly domainEvent?: DomainEvent;
  readonly room?: RoomAggregate;
  readonly reservation?: ReservationReadModel;
  readonly selectedRooms?: readonly RoomAggregate[];
  readonly housekeepingTask?: HousekeepingTask;
  readonly maintenanceTicket?: MaintenanceTicket;
  readonly operationRequest?: OperationRequest;
  readonly reservationWorkflow?: ProjectionDispatchWorkflowDraft;
  readonly audit?: ProjectionDispatchAuditPayload;
}

export interface ProjectionDispatchListOptions {
  readonly now?: string;
  readonly limit?: number;
}

export interface ProjectionDispatchMarkOptions {
  readonly outboxEntryId: string;
  readonly attemptedAt: string;
  readonly adapterOperation?: string;
  readonly adapterStatusCode?: number;
  readonly redactedError?: string;
  readonly nextAttemptAt?: string;
}

export interface PmsLocalSandboxStore extends ReservationDraftLifecycleStore, ReservationGroupDraftLifecycleStore, ReservationCancelLifecycleStore {
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;
  readonly storage: PmsLocalStorageMetadata;
  readback(roomId?: string): PmsSandboxReadback;
  reset(seedRooms?: readonly RoomAggregate[], seedReservations?: readonly PmsSandboxReservationImportRecord[]): PmsSandboxReadback;
  importReservations(reservations: readonly PmsSandboxReservationImportRecord[]): PmsSandboxReservationImportResult;
  getReservation(reservationCode: string, requestedAt: string): ReservationReadModel | undefined;
  searchReservations(query: ReservationSearchQuery, requestedAt: string): ReservationSearchReadModel;
  todayArrivals(businessDate: string, requestedAt: string): TodayReservationsReadModel;
  todayDepartures(businessDate: string, requestedAt: string): TodayReservationsReadModel;
  roomReservationContext(roomId: string, requestedAt: string): RoomReservationContextReadModel;
  hotelProfile(propertyId: string | undefined, generatedAt: string): HotelProfileReadModel;
  roomTypeCatalog(propertyId: string | undefined, generatedAt: string): RoomTypeCatalogReadModel;
  rebuildInventory(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  inventoryIntervals(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  inventorySummary(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  createOperationRequest(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse;
  getOperationRequest(request: OperationRequestGetApiRequest): OperationRequestGetApiResponse;
  listOperationRequests(request: OperationRequestListApiRequest): OperationRequestListApiResponse;
  updateOperationRequest(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse;
  listProjectionDispatchWork?(options?: ProjectionDispatchListOptions): readonly ProjectionDispatchWorkItem[];
  markProjectionDispatchDelivered?(options: ProjectionDispatchMarkOptions): void;
  markProjectionDispatchRetryable?(options: ProjectionDispatchMarkOptions): void;
  markProjectionDispatchFailed?(options: ProjectionDispatchMarkOptions): void;
  markProjectionDispatchSkipped?(options: ProjectionDispatchMarkOptions): void;
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse;
  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse;
  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse;
  recordCheckInStay?(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined;
  recordCheckOutStay?(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined;
  runInTransaction?<TValue>(operation: () => TValue): TValue;
  close?(): void;
}

export interface PmsLocalAuthConfig {
  readonly envName?: typeof pmsLocalAuthTokenEnvName | string;
  readonly token?: string;
  readonly required?: boolean;
}

export interface PmsLocalHttpHandlerOptions {
  readonly store: PmsLocalSandboxStore;
  readonly auth?: PmsLocalAuthConfig;
  readonly projectionDispatcher?: PmsProjectionDispatcherHealthConfig;
}

export interface PmsLocalHttpServerOptions extends PmsLocalHttpHandlerOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface StartedPmsLocalHttpServer {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}

export interface PmsProjectionDispatcherHealthConfig {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly adapterBaseUrlEnvName: string;
  readonly tokenEnvName: string;
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly rawAdapterUrlLogged: false;
  readonly rawTokenLogged: false;
}

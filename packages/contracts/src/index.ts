export type ActorType = 'human' | 'ai' | 'system';

export interface Actor {
  readonly type: ActorType;
  readonly id: string;
  readonly displayName?: string;
}

export type CommandSource = 'pms-core' | 'api' | 'mcp' | 'worker' | 'test';

export type CommandExecutionMode = 'dryRun' | 'confirm';

export type PmsCommandType =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'HOUSEKEEPING_DONE'
  | 'HOUSEKEEPING_INSPECTION'
  | 'HOUSEKEEPING_REWORK'
  | 'REPORT_MAINTENANCE'
  | 'MAINTENANCE_DONE'
  | 'RESTORE_SELLABLE';

export const supportedOperationRequestActions = [
  'CHECK_IN',
  'CHECK_OUT',
  'HOUSEKEEPING_DONE',
  'HOUSEKEEPING_INSPECTION',
  'HOUSEKEEPING_REWORK',
  'REPORT_MAINTENANCE',
  'MAINTENANCE_DONE',
  'RESTORE_SELLABLE',
] as const satisfies readonly PmsCommandType[];

export type OperationRequestAction = typeof supportedOperationRequestActions[number];
export type OperationRequestSource = 'external_form' | 'ai_pms' | 'api' | 'test';
export type OperationRequestStatus =
  | 'queued'
  | 'dryRunRequested'
  | 'awaitingConfirmation'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'needsManualReview'
  | 'expired'
  | 'duplicateIgnored'
  | 'rejected';

export const operationRequestSources: readonly OperationRequestSource[] = ['external_form', 'ai_pms', 'api', 'test'];
export const operationRequestStatuses: readonly OperationRequestStatus[] = [
  'queued',
  'dryRunRequested',
  'awaitingConfirmation',
  'processing',
  'completed',
  'failed',
  'needsManualReview',
  'expired',
  'duplicateIgnored',
  'rejected',
];

export interface OperationRequest {
  readonly operationRequestId: string;
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly source: OperationRequestSource;
  readonly action: OperationRequestAction;
  readonly status: OperationRequestStatus;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly reservationId?: string;
  readonly payloadJson: string;
  readonly resultJson?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isSupportedOperationRequestAction(value: string): value is OperationRequestAction {
  return (supportedOperationRequestActions as readonly string[]).includes(value);
}

export function isOperationRequestSource(value: string): value is OperationRequestSource {
  return (operationRequestSources as readonly string[]).includes(value);
}

export function isOperationRequestStatus(value: string): value is OperationRequestStatus {
  return (operationRequestStatuses as readonly string[]).includes(value);
}

export interface CommandMeta {
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly mode: CommandExecutionMode;
}

export type OccupancyStatus = 'vacant' | 'occupied' | 'dueOut';
export type CleaningStatus = 'clean' | 'dirty' | 'cleaning' | 'inspection' | 'rework';
export type SaleStatus = 'sellable' | 'outOfOrder' | 'outOfService';

export interface RoomStatus {
  readonly occupancy: OccupancyStatus;
  readonly cleaning: CleaningStatus;
  readonly sale: SaleStatus;
}

export interface RoomState {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
}

export type HousekeepingTaskKind = 'checkout-cleaning' | 'room-cleaning' | 'rework-cleaning';
export type HousekeepingTaskStatus = 'pending' | 'inProgress' | 'inspection' | 'rework' | 'done' | 'cancelled';

export interface HousekeepingTask {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTaskKind;
  readonly status: HousekeepingTaskStatus;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export type MaintenanceSeverity = 'Low' | 'Medium' | 'High' | 'StopSell';
export type MaintenanceTicketStatus = 'open' | 'inProgress' | 'resolved';

export interface MaintenanceTicket {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly severity: MaintenanceSeverity;
  readonly reason: string;
  readonly stopSellRequested: boolean;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface AuditEntry {
  readonly auditId: string;
  readonly commandType: string;
  readonly roomId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export type DomainErrorCode =
  | 'MISSING_COMMAND_META'
  | 'MISSING_REASON'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'MISSING_CORRELATION_ID'
  | 'MISSING_ACTOR'
  | 'INVALID_REQUESTED_AT'
  | 'INVALID_EXECUTION_MODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NOT_CHECKOUTABLE'
  | 'ROOM_NOT_CHECKIN_ELIGIBLE'
  | 'ROOM_NOT_HOUSEKEEPING_ELIGIBLE'
  | 'ROOM_NOT_MAINTENANCE_ELIGIBLE'
  | 'MAINTENANCE_TICKET_NOT_FOUND'
  | 'ROOM_ALREADY_SELLABLE';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly field?: string;
}

export interface DomainEventBase {
  readonly eventId: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actor: Actor;
}

export interface RoomCheckedInEvent extends DomainEventBase {
  readonly type: 'RoomCheckedIn';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export interface RoomCheckedOutEvent extends DomainEventBase {
  readonly type: 'RoomCheckedOut';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export interface HousekeepingTaskCreatedEvent extends DomainEventBase {
  readonly type: 'HousekeepingTaskCreated';
  readonly aggregateId: string;
  readonly task: HousekeepingTask;
}

export interface HousekeepingCompletedEvent extends DomainEventBase {
  readonly type: 'HousekeepingCompleted' | 'HousekeepingInspectionPassed' | 'HousekeepingInspectionFailed' | 'HousekeepingReworkCompleted';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly task?: HousekeepingTask;
}

export interface MaintenanceTicketEvent extends DomainEventBase {
  readonly type: 'MaintenanceReported' | 'MaintenanceCompleted';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly ticket: MaintenanceTicket;
}

export interface RoomSellabilityRestoredEvent extends DomainEventBase {
  readonly type: 'RoomSellabilityRestored';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export type DomainEvent =
  | RoomCheckedInEvent
  | RoomCheckedOutEvent
  | HousekeepingTaskCreatedEvent
  | HousekeepingCompletedEvent
  | MaintenanceTicketEvent
  | RoomSellabilityRestoredEvent;

export interface CheckInCommand {
  readonly type: 'CHECK_IN';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly overrideDirtyRoom?: boolean;
  readonly meta: CommandMeta;
}

export interface CheckOutCommand {
  readonly type: 'CHECK_OUT';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly meta: CommandMeta;
}

export interface HousekeepingDoneCommand {
  readonly type: 'HOUSEKEEPING_DONE';
  readonly roomId: string;
  readonly inspectionRequired?: boolean;
  readonly meta: CommandMeta;
}

export interface HousekeepingInspectionCommand {
  readonly type: 'HOUSEKEEPING_INSPECTION';
  readonly roomId: string;
  readonly result: 'pass' | 'fail';
  readonly taskId?: string;
  readonly meta: CommandMeta;
}

export interface HousekeepingReworkCommand {
  readonly type: 'HOUSEKEEPING_REWORK';
  readonly roomId: string;
  readonly inspectionRequired?: boolean;
  readonly taskId?: string;
  readonly meta: CommandMeta;
}

export interface ReportMaintenanceCommand {
  readonly type: 'REPORT_MAINTENANCE';
  readonly roomId: string;
  readonly severity?: MaintenanceSeverity;
  readonly stopSellRequested?: boolean;
  readonly note?: string;
  readonly meta: CommandMeta;
}

export interface MaintenanceDoneCommand {
  readonly type: 'MAINTENANCE_DONE';
  readonly roomId: string;
  readonly ticketId?: string;
  readonly note?: string;
  readonly meta: CommandMeta;
}

export interface RestoreSellableCommand {
  readonly type: 'RESTORE_SELLABLE';
  readonly roomId: string;
  readonly meta: CommandMeta;
}

export interface CheckInDryRunPlan {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly overrideDirtyRoom: boolean;
  readonly warnings: readonly string[];
  readonly events: ReadonlyArray<'RoomCheckedIn'>;
}

export interface CheckOutDryRunPlan {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: Omit<HousekeepingTask, 'taskId' | 'createdAt' | 'status'> & {
    readonly status: 'pending';
  };
  readonly events: ReadonlyArray<'RoomCheckedOut' | 'HousekeepingTaskCreated'>;
}

export interface PmsCommandDryRunPlan {
  readonly commandType: Exclude<PmsCommandType, 'CHECK_IN' | 'CHECK_OUT'>;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask?: Omit<HousekeepingTask, 'taskId' | 'createdAt'>;
  readonly maintenanceTicket?: Omit<MaintenanceTicket, 'ticketId' | 'createdAt'>;
  readonly events: readonly DomainEvent['type'][];
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export const checkoutableOccupancyStatuses: ReadonlyArray<OccupancyStatus> = ['occupied', 'dueOut'];

export const checkInNextStatus: RoomStatus = {
  occupancy: 'occupied',
  cleaning: 'clean',
  sale: 'sellable',
};

export const checkoutNextStatus: RoomStatus = {
  occupancy: 'vacant',
  cleaning: 'dirty',
  sale: 'sellable',
};

export const pmsProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export type ReadModelStatus = 'fresh' | 'stale' | 'partial' | 'unavailable';

export interface ProjectionFreshness {
  readonly status: ReadModelStatus;
  readonly generatedAt: string;
  readonly note: string;
}

export interface ReservationSummary {
  readonly reservationCode: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly guestLabel: string;
}

export type ReservationStatus = 'booked' | 'checkedIn' | 'checkedOut' | 'cancelled';
export type StayStatus = 'inHouse' | 'checkedOut';

export interface ReservationReadModel {
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
  readonly status: ReservationStatus;
  readonly projectionFreshness: ProjectionFreshness;
}

export interface StayReadModel {
  readonly stayId: string;
  readonly reservationId: string;
  readonly reservationCode?: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly checkedInAt?: string;
  readonly checkedOutAt?: string;
  readonly status: StayStatus;
  readonly projectionFreshness: ProjectionFreshness;
}

export interface TodayReservationsReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly businessDate: string;
  readonly summaryStatus: ReadModelStatus;
  readonly reservations: readonly ReservationReadModel[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface RoomReservationContextReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly roomId: string;
  readonly roomNumber?: string;
  readonly roomType?: string;
  readonly reservations: readonly ReservationReadModel[];
  readonly projectionFreshness: ProjectionFreshness;
}

export type InventoryBlockType = 'repair' | 'manualHold' | 'ownerBlock' | 'reservedInventory';
export type InventoryBlockStatus = 'active' | 'closed';
export type InventoryBlockSourceType = 'maintenance_ticket' | 'manual' | 'reservation' | 'stay' | 'room_status';
export type InventoryAvailabilityStatus = 'available' | 'blocked' | 'reserved' | 'occupied';
export type InventoryCalendarKind = InventoryAvailabilityStatus;
export type InventorySellableStatus = SaleStatus;

export interface InventorySourceRef {
  readonly sourceType: InventoryBlockSourceType | 'inventory_block';
  readonly sourceId: string;
  readonly label?: string;
}

export interface InventoryBlock {
  readonly blockId: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomTypeId?: string;
  readonly blockType: InventoryBlockType;
  readonly startDate: string;
  readonly endDate?: string;
  readonly status: InventoryBlockStatus;
  readonly sourceType: InventoryBlockSourceType;
  readonly sourceId: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
}

export interface InventoryDayRoom {
  readonly businessDate: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly availabilityStatus: InventoryAvailabilityStatus;
  readonly sourceRefs: readonly InventorySourceRef[];
  readonly updatedAt: string;
}

export interface InventoryIntervalProjection {
  readonly projectionId: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly calendarKind: InventoryCalendarKind;
  readonly sellableStatus: InventorySellableStatus;
  readonly title: string;
  readonly sourceRefs: readonly InventorySourceRef[];
  readonly updatedAt: string;
}

export interface InventorySummaryDayType {
  readonly businessDate: string;
  readonly propertyId: string;
  readonly roomTypeId: string;
  readonly roomType?: string;
  readonly totalRooms: number;
  readonly availableRooms: number;
  readonly occupiedRooms: number;
  readonly blockedRooms: number;
  readonly reservedRooms: number;
  readonly updatedAt: string;
}

export interface InventoryHorizonRequest {
  readonly startDate: string;
  readonly horizonDays: 30 | 60 | 90 | number;
  readonly roomId?: string;
}

export interface InventoryReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly horizonDays: number;
  readonly summaryStatus: ReadModelStatus;
  readonly blocks: readonly InventoryBlock[];
  readonly dayRooms: readonly InventoryDayRoom[];
  readonly intervals: readonly InventoryIntervalProjection[];
  readonly summaries: readonly InventorySummaryDayType[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface MaintenanceTicketSummary {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly reason: string;
}

export interface RoomReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly room: RoomState | undefined;
  readonly activeReservation: ReservationSummary | undefined;
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly maintenanceTickets: readonly MaintenanceTicketSummary[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface DashboardReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly counts: {
    readonly totalRooms: number;
    readonly vacantClean: number;
    readonly vacantDirty: number;
    readonly inHouse: number;
    readonly dueOut: number;
    readonly stopSell: number;
  };
  readonly queues: {
    readonly cleaning: number;
    readonly inspection: number;
    readonly pendingOperationRequests: number;
    readonly failedOperationRequests: number;
  };
  readonly projectionFreshness: ProjectionFreshness;
}

export interface RoomLedgerProjection {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
  readonly roomCode: string;
  readonly lastActor: Actor;
  readonly lastReason: string;
  readonly lastUpdatedAt: string;
}

export interface HousekeepingTaskProjection {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTaskKind;
  readonly status: HousekeepingTaskStatus;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface OperationLogProjection {
  readonly auditId: string;
  readonly commandType: PmsCommandType;
  readonly roomId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly domainEventTypes: readonly DomainEvent['type'][];
}

export interface MaintenanceTicketProjection {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly severity: MaintenanceSeverity;
  readonly reason: string;
  readonly stopSellRequested: boolean;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface CommandProjection {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly commandType: PmsCommandType;
  readonly mode: Extract<CommandExecutionMode, 'confirm'>;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly roomLedger: RoomLedgerProjection;
  readonly housekeepingTask?: HousekeepingTaskProjection;
  readonly maintenanceTicket?: MaintenanceTicketProjection;
  readonly operationLog: OperationLogProjection;
}

export interface DeferredPmsCommandStub {
  readonly commandType: Extract<PmsCommandType, 'HOUSEKEEPING_DONE' | 'REPORT_MAINTENANCE'>;
  readonly status: 'contract-stub';
  readonly owner: 'pms-platform';
  readonly mutationStatus: 'deferred';
  readonly reason: string;
}

export const deferredPmsCommandStubs: readonly DeferredPmsCommandStub[] = [];

export function validateCommandMeta(meta: CommandMeta | undefined): DomainError[] {
  if (!meta) {
    return [
      {
        code: 'MISSING_COMMAND_META',
        message: 'Command metadata is required.',
        field: 'meta',
      },
    ];
  }

  const errors: DomainError[] = [];

  if (!meta.actor?.id || !meta.actor.type) {
    errors.push({
      code: 'MISSING_ACTOR',
      message: 'Command actor id and type are required.',
      field: 'meta.actor',
    });
  }

  if (!meta.reason.trim()) {
    errors.push({
      code: 'MISSING_REASON',
      message: 'A reason is required for mutating PMS commands.',
      field: 'meta.reason',
    });
  }

  if (!meta.idempotencyKey.trim()) {
    errors.push({
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: 'An idempotency key is required for mutating PMS commands.',
      field: 'meta.idempotencyKey',
    });
  }

  if (!meta.correlationId.trim()) {
    errors.push({
      code: 'MISSING_CORRELATION_ID',
      message: 'A correlation id is required for command tracing.',
      field: 'meta.correlationId',
    });
  }

  if (Number.isNaN(Date.parse(meta.requestedAt))) {
    errors.push({
      code: 'INVALID_REQUESTED_AT',
      message: 'requestedAt must be an ISO-8601 timestamp.',
      field: 'meta.requestedAt',
    });
  }

  if (meta.mode !== 'dryRun' && meta.mode !== 'confirm') {
    errors.push({
      code: 'INVALID_EXECUTION_MODE',
      message: 'Command mode must be dryRun or confirm.',
      field: 'meta.mode',
    });
  }

  return errors;
}

export const checkinContractFixtures = {
  actor: {
    type: 'human',
    id: 'user-frontdesk-1',
    displayName: 'Front Desk',
  } satisfies Actor,
  room: {
    roomId: 'room-1003',
    roomNumber: '1003',
    status: {
      occupancy: 'vacant',
      cleaning: 'clean',
      sale: 'sellable',
    },
  } satisfies RoomState,
  dryRunCommand: {
    type: 'CHECK_IN',
    roomId: 'room-1003',
    meta: {
      actor: {
        type: 'human',
        id: 'user-frontdesk-1',
        displayName: 'Front Desk',
      },
      source: 'api',
      reason: 'Guest arrived with verified reservation.',
      idempotencyKey: 'checkin-room-1003-2026-04-25',
      correlationId: 'corr-checkin-room-1003',
      requestedAt: '2026-04-25T01:00:00.000Z',
      mode: 'dryRun',
    },
  } satisfies CheckInCommand,
  stableFailure: {
    code: 'ROOM_NOT_CHECKIN_ELIGIBLE',
    message: 'Room is not eligible for check-in.',
    field: 'room.status',
  } satisfies DomainError,
} as const;

export const checkoutContractFixtures = {
  actor: {
    type: 'human',
    id: 'user-frontdesk-1',
    displayName: 'Front Desk',
  } satisfies Actor,
  room: {
    roomId: 'room-1001',
    roomNumber: '1001',
    status: {
      occupancy: 'dueOut',
      cleaning: 'clean',
      sale: 'sellable',
    },
  } satisfies RoomState,
  dryRunCommand: {
    type: 'CHECK_OUT',
    roomId: 'room-1001',
    meta: {
      actor: {
        type: 'human',
        id: 'user-frontdesk-1',
        displayName: 'Front Desk',
      },
      source: 'api',
      reason: 'Guest departed and returned room cards.',
      idempotencyKey: 'checkout-room-1001-2026-04-25',
      correlationId: 'corr-checkout-room-1001',
      requestedAt: '2026-04-25T00:00:00.000Z',
      mode: 'dryRun',
    },
  } satisfies CheckOutCommand,
  stableFailure: {
    code: 'MISSING_REASON',
    message: 'A reason is required for mutating PMS commands.',
    field: 'meta.reason',
  } satisfies DomainError,
} as const;

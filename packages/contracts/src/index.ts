export type ActorType = 'human' | 'ai' | 'system';

export interface Actor {
  readonly type: ActorType;
  readonly id: string;
  readonly displayName?: string;
}

export type CommandSource = 'pms-core' | 'api' | 'mcp' | 'worker' | 'test';

export type CommandExecutionMode = 'dryRun' | 'confirm';

export type PmsCommandType = 'CHECK_IN' | 'CHECK_OUT' | 'HOUSEKEEPING_DONE' | 'REPORT_MAINTENANCE';

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
export type CleaningStatus = 'clean' | 'dirty';
export type SaleStatus = 'sellable' | 'outOfOrder' | 'outOfService';

export interface RoomStatus {
  readonly occupancy: OccupancyStatus;
  readonly cleaning: CleaningStatus;
  readonly sale: SaleStatus;
}

export interface RoomState {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly status: RoomStatus;
}

export type HousekeepingTaskKind = 'checkout-cleaning';
export type HousekeepingTaskStatus = 'pending' | 'inProgress' | 'done' | 'cancelled';

export interface HousekeepingTask {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTaskKind;
  readonly status: HousekeepingTaskStatus;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
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
  | 'ROOM_NOT_CHECKIN_ELIGIBLE';

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

export type DomainEvent = RoomCheckedInEvent | RoomCheckedOutEvent | HousekeepingTaskCreatedEvent;

export interface CheckInCommand {
  readonly type: 'CHECK_IN';
  readonly roomId: string;
  readonly overrideDirtyRoom?: boolean;
  readonly meta: CommandMeta;
}

export interface CheckOutCommand {
  readonly type: 'CHECK_OUT';
  readonly roomId: string;
  readonly meta: CommandMeta;
}

export interface CheckInDryRunPlan {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly overrideDirtyRoom: boolean;
  readonly warnings: readonly string[];
  readonly events: ReadonlyArray<'RoomCheckedIn'>;
}

export interface CheckOutDryRunPlan {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: Omit<HousekeepingTask, 'taskId' | 'createdAt' | 'status'> & {
    readonly status: 'pending';
  };
  readonly events: ReadonlyArray<'RoomCheckedOut' | 'HousekeepingTaskCreated'>;
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

export interface MaintenanceTicketSummary {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: 'open' | 'inProgress' | 'resolved';
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

export interface CommandProjection {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly commandType: Extract<PmsCommandType, 'CHECK_IN' | 'CHECK_OUT'>;
  readonly mode: Extract<CommandExecutionMode, 'confirm'>;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly roomLedger: RoomLedgerProjection;
  readonly housekeepingTask?: HousekeepingTaskProjection;
  readonly operationLog: OperationLogProjection;
}

export interface DeferredPmsCommandStub {
  readonly commandType: Extract<PmsCommandType, 'HOUSEKEEPING_DONE' | 'REPORT_MAINTENANCE'>;
  readonly status: 'contract-stub';
  readonly owner: 'pms-platform';
  readonly mutationStatus: 'deferred';
  readonly reason: string;
}

export const deferredPmsCommandStubs = [
  {
    commandType: 'HOUSEKEEPING_DONE',
    status: 'contract-stub',
    owner: 'pms-platform',
    mutationStatus: 'deferred',
    reason: 'Cleaning completion remains a named PMS-owned command contract; full workflow semantics are outside the dashboard MVP foundation slice.',
  },
  {
    commandType: 'REPORT_MAINTENANCE',
    status: 'contract-stub',
    owner: 'pms-platform',
    mutationStatus: 'deferred',
    reason: 'Maintenance reporting remains a named PMS-owned command contract; stop-sell mutation requires a future typed command or approval path.',
  },
] as const satisfies readonly DeferredPmsCommandStub[];

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

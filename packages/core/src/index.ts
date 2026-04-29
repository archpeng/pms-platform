import {
  checkoutableOccupancyStatuses,
  pmsProjectionSchemaVersion,
  type Actor,
  type AuditEntry,
  type CheckInCommand,
  type CheckInDryRunPlan,
  type CheckOutCommand,
  type CheckOutDryRunPlan,
  type CleaningStatus,
  type CommandExecutionMode,
  type CommandProjection,
  type DashboardReadModel,
  type DomainError,
  type DomainEvent,
  type HousekeepingTask,
  type HousekeepingTaskProjection,
  type MaintenanceDoneCommand,
  type MaintenanceSeverity,
  type MaintenanceTicket,
  type MaintenanceTicketProjection,
  type OccupancyStatus,
  type OperationLogProjection,
  type PmsCommandDryRunPlan,
  type PmsCommandType,
  type ProjectionFreshness,
  type ReadModelStatus,
  type ReportMaintenanceCommand,
  type RestoreSellableCommand,
  type RoomLedgerProjection,
  type RoomReadModel,
  type RoomState,
  type RoomStatus,
  type SaleStatus,
  type HousekeepingDoneCommand,
  type HousekeepingInspectionCommand,
  type HousekeepingReworkCommand,
  validateCommandMeta,
} from '@pms-platform/contracts';

export const corePackageName = '@pms-platform/core';

export interface RoomAggregate {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly occupancyStatus: OccupancyStatus;
  readonly cleaningStatus: CleaningStatus;
  readonly saleStatus: SaleStatus;
}

export interface CoreContractBoundaryCheck {
  readonly packageName: typeof corePackageName;
  readonly supportedCommandType: CheckOutCommand['type'];
  readonly supportedCommandTypes: readonly PmsCommandType[];
  readonly supportedReadModels: readonly ['pms_get_room', 'pms_dashboard'];
  readonly supportedExecutionModes: readonly CommandExecutionMode[];
}

export interface RoomRepository {
  get(roomId: string): RoomAggregate | undefined;
  save(room: RoomAggregate): void;
  list(): RoomAggregate[];
}

export interface HousekeepingTaskRepository {
  get(taskId: string): HousekeepingTask | undefined;
  save(task: HousekeepingTask): void;
  list(): HousekeepingTask[];
}

export interface MaintenanceTicketRepository {
  get(ticketId: string): MaintenanceTicket | undefined;
  save(ticket: MaintenanceTicket): void;
  list(): MaintenanceTicket[];
}

export interface AuditRepository {
  append(entry: AuditEntry): void;
  list(): AuditEntry[];
}

export interface IdempotencyRepository<TValue = unknown> {
  get(idempotencyKey: string): TValue | undefined;
  save(idempotencyKey: string, value: TValue): void;
  has(idempotencyKey: string): boolean;
}

export interface DomainEventCollector {
  append(event: DomainEvent): void;
  list(): DomainEvent[];
  clear(): void;
}

export interface CorePorts {
  readonly rooms: RoomRepository;
  readonly housekeepingTasks: HousekeepingTaskRepository;
  readonly maintenanceTickets: MaintenanceTicketRepository;
  readonly audits: AuditRepository;
  readonly idempotency: IdempotencyRepository;
  readonly events: DomainEventCollector;
}

export interface CoreCheckInDryRunPlan extends CheckInDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckInConfirmResult {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export interface CoreCheckOutDryRunPlan extends CheckOutDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckOutConfirmResult {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: HousekeepingTask;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export interface CorePmsCommandConfirmResult {
  readonly commandType: Exclude<PmsCommandType, 'CHECK_IN' | 'CHECK_OUT'>;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask?: HousekeepingTask;
  readonly maintenanceTicket?: MaintenanceTicket;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export type CheckInResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckInDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckInConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export type CheckOutResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckOutDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckOutConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export type PmsCommandResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: PmsCommandDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CorePmsCommandConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export const supportedOccupancyStatuses: readonly OccupancyStatus[] = ['occupied', 'dueOut', 'vacant'];
export const supportedCleaningStatuses: readonly CleaningStatus[] = ['clean', 'dirty', 'cleaning', 'inspection', 'rework'];
export const supportedSaleStatuses: readonly SaleStatus[] = ['sellable', 'outOfOrder', 'outOfService'];
export const supportedExecutionModes: readonly CommandExecutionMode[] = ['dryRun', 'confirm'];

export function describeCoreContractBoundary(): CoreContractBoundaryCheck {
  return {
    packageName: corePackageName,
    supportedCommandType: 'CHECK_OUT',
    supportedCommandTypes: [
      'CHECK_IN',
      'CHECK_OUT',
      'HOUSEKEEPING_DONE',
      'HOUSEKEEPING_INSPECTION',
      'HOUSEKEEPING_REWORK',
      'REPORT_MAINTENANCE',
      'MAINTENANCE_DONE',
      'RESTORE_SELLABLE',
    ],
    supportedReadModels: ['pms_get_room', 'pms_dashboard'],
    supportedExecutionModes,
  };
}

export function deriveRoomCode(room: Pick<RoomAggregate, 'roomNumber' | 'occupancyStatus' | 'cleaningStatus' | 'saleStatus'>): string {
  return [room.roomNumber, room.occupancyStatus, room.cleaningStatus, room.saleStatus].join(':');
}

export function roomAggregateFromState(state: RoomState): RoomAggregate {
  return {
    roomId: state.roomId,
    roomNumber: state.roomNumber,
    propertyId: state.propertyId,
    roomTypeId: state.roomTypeId,
    roomType: state.roomType,
    zone: state.zone,
    sortKey: state.sortKey,
    occupancyStatus: state.status.occupancy,
    cleaningStatus: state.status.cleaning,
    saleStatus: state.status.sale,
  };
}

export function roomStateFromAggregate(room: RoomAggregate): RoomState {
  return {
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    propertyId: room.propertyId,
    roomTypeId: room.roomTypeId,
    roomType: room.roomType,
    zone: room.zone,
    sortKey: room.sortKey,
    status: {
      occupancy: room.occupancyStatus,
      cleaning: room.cleaningStatus,
      sale: room.saleStatus,
    },
  };
}

export function createCheckoutCleaningTask(input: {
  readonly taskId: string;
  readonly roomId: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
}): HousekeepingTask {
  return {
    taskId: input.taskId,
    roomId: input.roomId,
    kind: 'checkout-cleaning',
    status: 'pending',
    reason: input.reason,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
  };
}

export function createHousekeepingTask(input: {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTask['kind'];
  readonly status: HousekeepingTask['status'];
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
}): HousekeepingTask {
  return {
    taskId: input.taskId,
    roomId: input.roomId,
    kind: input.kind,
    status: input.status,
    reason: input.reason,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
  };
}

export function createMaintenanceTicket(input: MaintenanceTicket): MaintenanceTicket {
  return { ...input };
}

export function checkIn(command: CheckInCommand, ports: CorePorts): CheckInResult {
  const metaErrors = validateCommandMeta(command.meta);
  const mode = command.meta?.mode === 'dryRun' || command.meta?.mode === 'confirm' ? command.meta.mode : 'unsupported';

  if (metaErrors.length > 0) {
    return {
      ok: false,
      mode,
      errors: metaErrors,
    };
  }

  if (command.meta.mode === 'confirm') {
    const idempotentResult = ports.idempotency.get(command.meta.idempotencyKey) as CoreCheckInConfirmResult | undefined;
    if (idempotentResult) {
      return {
        ok: true,
        mode: 'confirm',
        result: idempotentResult,
      };
    }
  }

  const room = ports.rooms.get(command.roomId);
  const errors = validateCheckInDomainInput(command, room);

  if (errors.length > 0) {
    return {
      ok: false,
      mode,
      errors,
    };
  }

  if (!room) {
    throw new Error('Invariant violation: check-in room must exist after validation succeeds.');
  }

  if (command.meta.mode === 'confirm') {
    return confirmCheckIn(command, room, ports);
  }

  return dryRunCheckIn(command, room);
}

export function checkOut(command: CheckOutCommand, ports: CorePorts): CheckOutResult {
  const metaErrors = validateCommandMeta(command.meta);
  const mode = command.meta?.mode === 'dryRun' || command.meta?.mode === 'confirm' ? command.meta.mode : 'unsupported';

  if (metaErrors.length > 0) {
    return {
      ok: false,
      mode,
      errors: metaErrors,
    };
  }

  if (command.meta.mode === 'confirm') {
    const idempotentResult = ports.idempotency.get(command.meta.idempotencyKey) as CoreCheckOutConfirmResult | undefined;
    if (idempotentResult) {
      return {
        ok: true,
        mode: 'confirm',
        result: idempotentResult,
      };
    }
  }

  const room = ports.rooms.get(command.roomId);
  const errors = validateCheckoutDomainInput(command, room);

  if (errors.length > 0) {
    return {
      ok: false,
      mode,
      errors,
    };
  }

  if (!room) {
    throw new Error('Invariant violation: checkout room must exist after validation succeeds.');
  }

  if (command.meta.mode === 'confirm') {
    return confirmCheckOut(command, room, ports);
  }

  return dryRunCheckOut(command, room);
}

export function housekeepingDone(command: HousekeepingDoneCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.inspectionRequired === true ? 'inspection' : 'clean',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'room-cleaning',
        status: command.inspectionRequired === true ? 'inspection' : 'done',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.inspectionRequired === true ? {} : { completedAt: command.meta.requestedAt }),
      },
      events: ['HousekeepingCompleted'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-housekeeping-${idSuffix}`,
          roomId: room.roomId,
          kind: 'room-cleaning',
          status: 'inProgress',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-completed-${idSuffix}`,
            type: 'HousekeepingCompleted' as const,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function housekeepingInspection(command: HousekeepingInspectionCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.result === 'pass' ? 'clean' : 'rework',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'room-cleaning',
        status: command.result === 'pass' ? 'done' : 'rework',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.result === 'pass' ? { completedAt: command.meta.requestedAt } : {}),
      },
      events: [command.result === 'pass' ? 'HousekeepingInspectionPassed' : 'HousekeepingInspectionFailed'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = command.taskId ? ports.housekeepingTasks.get(command.taskId) : findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-inspection-${idSuffix}`,
          roomId: room.roomId,
          kind: 'room-cleaning',
          status: 'inspection',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      const type = command.result === 'pass' ? 'HousekeepingInspectionPassed' : 'HousekeepingInspectionFailed';
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-inspection-${idSuffix}`,
            type,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function housekeepingRework(command: HousekeepingReworkCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      cleaning: command.inspectionRequired === true ? 'inspection' : 'clean',
    }),
    dryRunExtras: (room) => ({
      housekeepingTask: {
        roomId: room.roomId,
        kind: 'rework-cleaning',
        status: command.inspectionRequired === true ? 'inspection' : 'done',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        ...(command.inspectionRequired === true ? {} : { completedAt: command.meta.requestedAt }),
      },
      events: ['HousekeepingReworkCompleted'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTask = command.taskId ? ports.housekeepingTasks.get(command.taskId) : findActiveHousekeepingTaskForRoom(ports, room.roomId);
      const task = completeHousekeepingTask(
        existingTask ?? createHousekeepingTask({
          taskId: `task-rework-${idSuffix}`,
          roomId: room.roomId,
          kind: 'rework-cleaning',
          status: 'rework',
          reason: command.meta.reason,
          correlationId: command.meta.correlationId,
          createdAt: command.meta.requestedAt,
        }),
        nextStatus.cleaning,
        command.meta.requestedAt,
      );
      return {
        housekeepingTask: task,
        events: [
          {
            eventId: `event-housekeeping-rework-completed-${idSuffix}`,
            type: 'HousekeepingReworkCompleted' as const,
            aggregateId: room.roomId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            task,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function reportMaintenance(command: ReportMaintenanceCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      sale: maintenanceRequiresStopSell(command) ? 'outOfOrder' : room.saleStatus,
    }),
    dryRunExtras: (room) => ({
      maintenanceTicket: {
        roomId: room.roomId,
        status: 'open',
        severity: normalizeMaintenanceSeverity(command.severity),
        reason: command.note || command.meta.reason,
        stopSellRequested: maintenanceRequiresStopSell(command),
        correlationId: command.meta.correlationId,
      },
      events: ['MaintenanceReported'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const ticket = createMaintenanceTicket({
        ticketId: `ticket-maintenance-${idSuffix}`,
        roomId: room.roomId,
        status: 'open',
        severity: normalizeMaintenanceSeverity(command.severity),
        reason: command.note || command.meta.reason,
        stopSellRequested: maintenanceRequiresStopSell(command),
        correlationId: command.meta.correlationId,
        createdAt: command.meta.requestedAt,
      });
      return {
        maintenanceTicket: ticket,
        events: [
          {
            eventId: `event-maintenance-reported-${idSuffix}`,
            type: 'MaintenanceReported' as const,
            aggregateId: ticket.ticketId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            ticket,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function maintenanceDone(command: MaintenanceDoneCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    validate: (room) => {
      const ticket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      return ticket
        ? []
        : [{
            code: 'MAINTENANCE_TICKET_NOT_FOUND' as const,
            message: 'Open maintenance ticket was not found.',
            field: 'ticketId',
          }];
    },
    nextStatus: (room) => roomStateFromAggregate(room).status,
    dryRunExtras: (room) => {
      const ticket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      return {
        maintenanceTicket: ticket
          ? {
              ...ticket,
              status: 'resolved',
              resolvedAt: command.meta.requestedAt,
            }
          : undefined,
        events: ['MaintenanceCompleted'],
      };
    },
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => {
      const existingTicket = findMaintenanceTicket(ports, room.roomId, command.ticketId);
      if (!existingTicket) {
        throw new Error('Invariant violation: maintenance ticket must exist after validation succeeds.');
      }
      const ticket: MaintenanceTicket = {
        ...existingTicket,
        status: 'resolved',
        resolvedAt: command.meta.requestedAt,
      };
      return {
        maintenanceTicket: ticket,
        events: [
          {
            eventId: `event-maintenance-completed-${idSuffix}`,
            type: 'MaintenanceCompleted' as const,
            aggregateId: ticket.ticketId,
            roomId: room.roomId,
            previousStatus,
            nextStatus,
            ticket,
            occurredAt: command.meta.requestedAt,
            correlationId: command.meta.correlationId,
            idempotencyKey: command.meta.idempotencyKey,
            actor: { ...command.meta.actor },
          },
        ],
      };
    },
  });
}

export function restoreSellable(command: RestoreSellableCommand, ports: CorePorts): PmsCommandResult {
  return executeRoomCommand(command, ports, {
    validate: (room) => room.saleStatus === 'sellable'
      ? [{
          code: 'ROOM_ALREADY_SELLABLE' as const,
          message: 'Room is already sellable.',
          field: 'room.saleStatus',
        }]
      : [],
    nextStatus: (room) => ({
      ...roomStateFromAggregate(room).status,
      sale: 'sellable',
    }),
    dryRunExtras: () => ({
      events: ['RoomSellabilityRestored'],
    }),
    confirm: ({ command, room, previousStatus, nextStatus, idSuffix }) => ({
      events: [
        {
          eventId: `event-room-sellability-restored-${idSuffix}`,
          type: 'RoomSellabilityRestored' as const,
          aggregateId: room.roomId,
          roomId: room.roomId,
          previousStatus,
          nextStatus,
          occurredAt: command.meta.requestedAt,
          correlationId: command.meta.correlationId,
          idempotencyKey: command.meta.idempotencyKey,
          actor: { ...command.meta.actor },
        },
      ],
    }),
  });
}

export function checkInNextStatusForRoom(room: Pick<RoomAggregate, 'cleaningStatus' | 'saleStatus'>): RoomStatus {
  return {
    occupancy: 'occupied',
    cleaning: room.cleaningStatus,
    sale: room.saleStatus,
  };
}

export function checkoutNextStatusForRoom(room: Pick<RoomAggregate, 'saleStatus'>): RoomStatus {
  return {
    occupancy: 'vacant',
    cleaning: 'dirty',
    sale: room.saleStatus,
  };
}

type ExtendedCommand =
  | HousekeepingDoneCommand
  | HousekeepingInspectionCommand
  | HousekeepingReworkCommand
  | ReportMaintenanceCommand
  | MaintenanceDoneCommand
  | RestoreSellableCommand;

interface ExecuteRoomCommandOptions<TCommand extends ExtendedCommand> {
  validate?: (room: RoomAggregate) => readonly DomainError[];
  nextStatus(room: RoomAggregate): RoomStatus;
  dryRunExtras(room: RoomAggregate, nextStatus: RoomStatus): {
    readonly housekeepingTask?: PmsCommandDryRunPlan['housekeepingTask'];
    readonly maintenanceTicket?: PmsCommandDryRunPlan['maintenanceTicket'];
    readonly events: readonly DomainEvent['type'][];
  };
  confirm(input: {
    readonly command: TCommand;
    readonly room: RoomAggregate;
    readonly previousStatus: RoomStatus;
    readonly nextStatus: RoomStatus;
    readonly idSuffix: string;
  }): {
    readonly housekeepingTask?: HousekeepingTask;
    readonly maintenanceTicket?: MaintenanceTicket;
    readonly events: readonly DomainEvent[];
  };
}

function executeRoomCommand<TCommand extends ExtendedCommand>(
  command: TCommand,
  ports: CorePorts,
  options: ExecuteRoomCommandOptions<TCommand>,
): PmsCommandResult {
  const metaErrors = validateCommandMeta(command.meta);
  const mode = command.meta?.mode === 'dryRun' || command.meta?.mode === 'confirm' ? command.meta.mode : 'unsupported';

  if (metaErrors.length > 0) {
    return {
      ok: false,
      mode,
      errors: metaErrors,
    };
  }

  if (command.meta.mode === 'confirm') {
    const idempotentResult = ports.idempotency.get(command.meta.idempotencyKey) as CorePmsCommandConfirmResult | undefined;
    if (idempotentResult) {
      return {
        ok: true,
        mode: 'confirm',
        result: idempotentResult,
      };
    }
  }

  const room = ports.rooms.get(command.roomId);
  const errors = validateRoomCommandInput(command, room);
  if (room && options.validate) {
    errors.push(...options.validate(room));
  }
  if (errors.length > 0) {
    return {
      ok: false,
      mode,
      errors,
    };
  }
  if (!room) {
    throw new Error('Invariant violation: command room must exist after validation succeeds.');
  }

  const previousStatus = roomStateFromAggregate(room).status;
  const nextStatus = options.nextStatus(room);

  if (command.meta.mode === 'dryRun') {
    return {
      ok: true,
      mode: 'dryRun',
      plan: {
        commandType: command.type,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        propertyId: room.propertyId,
        roomTypeId: room.roomTypeId,
        roomType: room.roomType,
        zone: room.zone,
        sortKey: room.sortKey,
        currentStatus: previousStatus,
        nextStatus,
        ...options.dryRunExtras(room, nextStatus),
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        idempotencyKey: command.meta.idempotencyKey,
        requestedAt: command.meta.requestedAt,
        actor: { ...command.meta.actor },
      },
    };
  }

  const idSuffix = safeIdSuffix(command.meta.idempotencyKey);
  const confirmExtras = options.confirm({ command, room, previousStatus, nextStatus, idSuffix });
  const auditEntry: AuditEntry = {
    auditId: `audit-${command.type.toLowerCase().replaceAll('_', '-')}-${idSuffix}`,
    commandType: command.type,
    roomId: room.roomId,
    actor: { ...command.meta.actor },
    source: command.meta.source,
    reason: command.meta.reason,
    idempotencyKey: command.meta.idempotencyKey,
    correlationId: command.meta.correlationId,
    occurredAt: command.meta.requestedAt,
  };
  const result: CorePmsCommandConfirmResult = {
    commandType: command.type,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    propertyId: room.propertyId,
    roomTypeId: room.roomTypeId,
    roomType: room.roomType,
    zone: room.zone,
    sortKey: room.sortKey,
    previousStatus,
    nextStatus,
    ...(confirmExtras.housekeepingTask ? { housekeepingTask: confirmExtras.housekeepingTask } : {}),
    ...(confirmExtras.maintenanceTicket ? { maintenanceTicket: confirmExtras.maintenanceTicket } : {}),
    auditEntry,
    events: confirmExtras.events,
  };

  ports.rooms.save({
    ...room,
    occupancyStatus: nextStatus.occupancy,
    cleaningStatus: nextStatus.cleaning,
    saleStatus: nextStatus.sale,
  });
  if (confirmExtras.housekeepingTask) {
    ports.housekeepingTasks.save(confirmExtras.housekeepingTask);
  }
  if (confirmExtras.maintenanceTicket) {
    ports.maintenanceTickets.save(confirmExtras.maintenanceTicket);
  }
  ports.audits.append(auditEntry);
  for (const event of confirmExtras.events) {
    ports.events.append(event);
  }
  ports.idempotency.save(command.meta.idempotencyKey, result);

  return {
    ok: true,
    mode: 'confirm',
    result,
  };
}

function validateRoomCommandInput(command: ExtendedCommand, room: RoomAggregate | undefined): DomainError[] {
  const errors = validateCommandMeta(command.meta);
  if (!room) {
    errors.push({
      code: 'ROOM_NOT_FOUND',
      message: 'Room was not found.',
      field: 'roomId',
    });
  }
  return errors;
}

function dryRunCheckIn(command: CheckInCommand, room: RoomAggregate): CheckInResult {
  const currentStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkInNextStatusForRoom(room);
  const warnings = command.overrideDirtyRoom && room.cleaningStatus !== 'clean' ? ['DIRTY_ROOM_OVERRIDE_APPROVED'] : [];

  return {
    ok: true,
    mode: 'dryRun',
    plan: {
      commandType: 'CHECK_IN',
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      ...(command.reservationId ? { reservationId: command.reservationId } : {}),
      ...(command.reservationCode ? { reservationCode: command.reservationCode } : {}),
      propertyId: room.propertyId,
      roomTypeId: room.roomTypeId,
      roomType: room.roomType,
      zone: room.zone,
      sortKey: room.sortKey,
      currentStatus,
      nextStatus,
      overrideDirtyRoom: command.overrideDirtyRoom === true,
      warnings,
      events: ['RoomCheckedIn'],
      reason: command.meta.reason,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      requestedAt: command.meta.requestedAt,
      actor: { ...command.meta.actor },
    },
  };
}

function confirmCheckIn(command: CheckInCommand, room: RoomAggregate, ports: CorePorts): CheckInResult {
  const previousStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkInNextStatusForRoom(room);
  const idSuffix = safeIdSuffix(command.meta.idempotencyKey);
  const auditEntry: AuditEntry = {
    auditId: `audit-checkin-${idSuffix}`,
    commandType: 'CHECK_IN',
    roomId: room.roomId,
    actor: { ...command.meta.actor },
    source: command.meta.source,
    reason: command.meta.reason,
    idempotencyKey: command.meta.idempotencyKey,
    correlationId: command.meta.correlationId,
    occurredAt: command.meta.requestedAt,
  };
  const events: readonly DomainEvent[] = [
    {
      eventId: `event-room-checked-in-${idSuffix}`,
      type: 'RoomCheckedIn',
      aggregateId: room.roomId,
      roomId: room.roomId,
      previousStatus,
      nextStatus,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
  ];
  const result: CoreCheckInConfirmResult = {
    commandType: 'CHECK_IN',
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    ...(command.reservationId ? { reservationId: command.reservationId } : {}),
    ...(command.reservationCode ? { reservationCode: command.reservationCode } : {}),
    propertyId: room.propertyId,
    roomTypeId: room.roomTypeId,
    roomType: room.roomType,
    zone: room.zone,
    sortKey: room.sortKey,
    previousStatus,
    nextStatus,
    auditEntry,
    events,
  };

  ports.rooms.save({
    ...room,
    occupancyStatus: nextStatus.occupancy,
    cleaningStatus: nextStatus.cleaning,
    saleStatus: nextStatus.sale,
  });
  ports.audits.append(auditEntry);
  for (const event of events) {
    ports.events.append(event);
  }
  ports.idempotency.save(command.meta.idempotencyKey, result);

  return {
    ok: true,
    mode: 'confirm',
    result,
  };
}

function dryRunCheckOut(command: CheckOutCommand, room: RoomAggregate): CheckOutResult {
  const currentStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkoutNextStatusForRoom(room);
  const housekeepingTask = {
    roomId: room.roomId,
    kind: 'checkout-cleaning' as const,
    status: 'pending' as const,
    reason: command.meta.reason,
    correlationId: command.meta.correlationId,
  };

  return {
    ok: true,
    mode: 'dryRun',
    plan: {
      commandType: 'CHECK_OUT',
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      ...(command.reservationId ? { reservationId: command.reservationId } : {}),
      ...(command.reservationCode ? { reservationCode: command.reservationCode } : {}),
      propertyId: room.propertyId,
      roomTypeId: room.roomTypeId,
      roomType: room.roomType,
      zone: room.zone,
      sortKey: room.sortKey,
      currentStatus,
      nextStatus,
      housekeepingTask,
      events: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
      reason: command.meta.reason,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      requestedAt: command.meta.requestedAt,
      actor: { ...command.meta.actor },
    },
  };
}

function confirmCheckOut(command: CheckOutCommand, room: RoomAggregate, ports: CorePorts): CheckOutResult {
  const previousStatus = roomStateFromAggregate(room).status;
  const nextStatus = checkoutNextStatusForRoom(room);
  const idSuffix = safeIdSuffix(command.meta.idempotencyKey);
  const task = createCheckoutCleaningTask({
    taskId: `task-checkout-${idSuffix}`,
    roomId: room.roomId,
    reason: command.meta.reason,
    correlationId: command.meta.correlationId,
    createdAt: command.meta.requestedAt,
  });
  const auditEntry: AuditEntry = {
    auditId: `audit-checkout-${idSuffix}`,
    commandType: 'CHECK_OUT',
    roomId: room.roomId,
    actor: { ...command.meta.actor },
    source: command.meta.source,
    reason: command.meta.reason,
    idempotencyKey: command.meta.idempotencyKey,
    correlationId: command.meta.correlationId,
    occurredAt: command.meta.requestedAt,
  };
  const events: readonly DomainEvent[] = [
    {
      eventId: `event-room-checked-out-${idSuffix}`,
      type: 'RoomCheckedOut',
      aggregateId: room.roomId,
      roomId: room.roomId,
      previousStatus,
      nextStatus,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
    {
      eventId: `event-housekeeping-task-created-${idSuffix}`,
      type: 'HousekeepingTaskCreated',
      aggregateId: task.taskId,
      task,
      occurredAt: command.meta.requestedAt,
      correlationId: command.meta.correlationId,
      idempotencyKey: command.meta.idempotencyKey,
      actor: { ...command.meta.actor },
    },
  ];
  const result: CoreCheckOutConfirmResult = {
    commandType: 'CHECK_OUT',
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    ...(command.reservationId ? { reservationId: command.reservationId } : {}),
    ...(command.reservationCode ? { reservationCode: command.reservationCode } : {}),
    propertyId: room.propertyId,
    roomTypeId: room.roomTypeId,
    roomType: room.roomType,
    zone: room.zone,
    sortKey: room.sortKey,
    previousStatus,
    nextStatus,
    housekeepingTask: task,
    auditEntry,
    events,
  };

  ports.rooms.save({
    ...room,
    occupancyStatus: nextStatus.occupancy,
    cleaningStatus: nextStatus.cleaning,
    saleStatus: nextStatus.sale,
  });
  ports.housekeepingTasks.save(task);
  ports.audits.append(auditEntry);
  for (const event of events) {
    ports.events.append(event);
  }
  ports.idempotency.save(command.meta.idempotencyKey, result);

  return {
    ok: true,
    mode: 'confirm',
    result,
  };
}

function findActiveHousekeepingTaskForRoom(ports: CorePorts, roomId: string): HousekeepingTask | undefined {
  return ports.housekeepingTasks
    .list()
    .filter((task) => task.roomId === roomId && task.status !== 'done' && task.status !== 'cancelled')
    .at(-1);
}

function completeHousekeepingTask(task: HousekeepingTask, nextCleaningStatus: CleaningStatus, completedAt: string): HousekeepingTask {
  if (nextCleaningStatus === 'inspection') {
    return { ...task, status: 'inspection' };
  }
  if (nextCleaningStatus === 'rework') {
    return { ...task, status: 'rework' };
  }
  return { ...task, status: 'done', completedAt };
}

function normalizeMaintenanceSeverity(value: MaintenanceSeverity | undefined): MaintenanceSeverity {
  return value ?? 'Medium';
}

function maintenanceRequiresStopSell(command: ReportMaintenanceCommand): boolean {
  return command.stopSellRequested === true || command.severity === 'StopSell';
}

function findMaintenanceTicket(ports: CorePorts, roomId: string, ticketId?: string): MaintenanceTicket | undefined {
  if (ticketId) {
    const ticket = ports.maintenanceTickets.get(ticketId);
    return ticket?.roomId === roomId ? ticket : undefined;
  }
  return ports.maintenanceTickets
    .list()
    .filter((ticket) => ticket.roomId === roomId && ticket.status !== 'resolved')
    .at(-1);
}

function safeIdSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function validateCheckInDomainInput(command: CheckInCommand, room: RoomAggregate | undefined): DomainError[] {
  const errors = validateCommandMeta(command.meta);

  if (!room) {
    errors.push({
      code: 'ROOM_NOT_FOUND',
      message: 'Room was not found.',
      field: 'roomId',
    });
    return errors;
  }

  const dirtyAllowed = command.overrideDirtyRoom === true;
  if (room.occupancyStatus !== 'vacant' || room.saleStatus !== 'sellable' || (room.cleaningStatus !== 'clean' && !dirtyAllowed)) {
    errors.push({
      code: 'ROOM_NOT_CHECKIN_ELIGIBLE',
      message: 'Room is not eligible for check-in.',
      field: 'room.status',
    });
  }

  return errors;
}

export function validateCheckoutDomainInput(command: CheckOutCommand, room: RoomAggregate | undefined): DomainError[] {
  const errors = validateCommandMeta(command.meta);

  if (!room) {
    errors.push({
      code: 'ROOM_NOT_FOUND',
      message: 'Room was not found.',
      field: 'roomId',
    });
    return errors;
  }

  if (!checkoutableOccupancyStatuses.includes(room.occupancyStatus)) {
    errors.push({
      code: 'ROOM_NOT_CHECKOUTABLE',
      message: 'Room is not in a checkoutable occupancy state.',
      field: 'room.occupancyStatus',
    });
  }

  return errors;
}

export function getRoomReadModel(roomId: string, ports: CorePorts, generatedAt: string): RoomReadModel {
  const room = ports.rooms.get(roomId);
  const housekeepingTasks = ports.housekeepingTasks.list().filter((task) => task.roomId === roomId);
  const maintenanceTickets = ports.maintenanceTickets.list().filter((ticket) => ticket.roomId === roomId);
  const projectionFreshness = createProjectionFreshness(generatedAt, room ? 'fresh' : 'unavailable');

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    generatedAt,
    summaryStatus: projectionFreshness.status,
    room: room ? roomStateFromAggregate(room) : undefined,
    activeReservation: undefined,
    housekeepingTasks,
    maintenanceTickets,
    projectionFreshness,
  };
}

export function getDashboardReadModel(ports: CorePorts, generatedAt: string): DashboardReadModel {
  const rooms = ports.rooms.list();
  const tasks = ports.housekeepingTasks.list();
  const projectionFreshness = createProjectionFreshness(generatedAt, 'fresh');

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    generatedAt,
    summaryStatus: projectionFreshness.status,
    counts: {
      totalRooms: rooms.length,
      vacantClean: rooms.filter((room) => room.occupancyStatus === 'vacant' && room.cleaningStatus === 'clean').length,
      vacantDirty: rooms.filter((room) => room.occupancyStatus === 'vacant' && room.cleaningStatus === 'dirty').length,
      inHouse: rooms.filter((room) => room.occupancyStatus === 'occupied').length,
      dueOut: rooms.filter((room) => room.occupancyStatus === 'dueOut').length,
      stopSell: rooms.filter((room) => room.saleStatus !== 'sellable').length,
    },
    queues: {
      cleaning: tasks.filter((task) => task.status === 'pending' || task.status === 'inProgress').length,
      inspection: tasks.filter((task) => task.status === 'inspection').length,
      pendingOperationRequests: 0,
      failedOperationRequests: 0,
    },
    projectionFreshness,
  };
}

export function buildCheckInProjection(result: CoreCheckInConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_IN',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
  });
}

export function buildCheckOutProjection(result: CoreCheckOutConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_OUT',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
    housekeepingTask: result.housekeepingTask,
  });
}

export function buildPmsCommandProjection(result: CorePmsCommandConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: result.commandType,
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
    housekeepingTask: result.housekeepingTask,
    maintenanceTicket: result.maintenanceTicket,
  });
}

export function createInMemoryRoomRepository(initialRooms: readonly RoomAggregate[] = []): RoomRepository {
  const rooms = new Map(initialRooms.map((room) => [room.roomId, cloneRoom(room)]));

  return {
    get(roomId) {
      const room = rooms.get(roomId);
      return room ? cloneRoom(room) : undefined;
    },
    save(room) {
      rooms.set(room.roomId, cloneRoom(room));
    },
    list() {
      return Array.from(rooms.values(), cloneRoom);
    },
  };
}

export function createInMemoryHousekeepingTaskRepository(
  initialTasks: readonly HousekeepingTask[] = [],
): HousekeepingTaskRepository {
  const tasks = new Map(initialTasks.map((task) => [task.taskId, cloneHousekeepingTask(task)]));

  return {
    get(taskId) {
      const task = tasks.get(taskId);
      return task ? cloneHousekeepingTask(task) : undefined;
    },
    save(task) {
      tasks.set(task.taskId, cloneHousekeepingTask(task));
    },
    list() {
      return Array.from(tasks.values(), cloneHousekeepingTask);
    },
  };
}

export function createInMemoryMaintenanceTicketRepository(
  initialTickets: readonly MaintenanceTicket[] = [],
): MaintenanceTicketRepository {
  const tickets = new Map(initialTickets.map((ticket) => [ticket.ticketId, cloneMaintenanceTicket(ticket)]));

  return {
    get(ticketId) {
      const ticket = tickets.get(ticketId);
      return ticket ? cloneMaintenanceTicket(ticket) : undefined;
    },
    save(ticket) {
      tickets.set(ticket.ticketId, cloneMaintenanceTicket(ticket));
    },
    list() {
      return Array.from(tickets.values(), cloneMaintenanceTicket);
    },
  };
}

export function createInMemoryAuditRepository(initialEntries: readonly AuditEntry[] = []): AuditRepository {
  const entries = initialEntries.map(cloneAuditEntry);

  return {
    append(entry) {
      entries.push(cloneAuditEntry(entry));
    },
    list() {
      return entries.map(cloneAuditEntry);
    },
  };
}

export function createInMemoryIdempotencyRepository<TValue = unknown>(
  initialEntries: readonly (readonly [string, TValue])[] = [],
): IdempotencyRepository<TValue> {
  const entries = new Map<string, TValue>(initialEntries.map(([key, value]) => [key, cloneValue(value)]));

  return {
    get(idempotencyKey) {
      const value = entries.get(idempotencyKey);
      return value === undefined ? undefined : cloneValue(value);
    },
    save(idempotencyKey, value) {
      entries.set(idempotencyKey, cloneValue(value));
    },
    has(idempotencyKey) {
      return entries.has(idempotencyKey);
    },
  };
}

export function createInMemoryDomainEventCollector(initialEvents: readonly DomainEvent[] = []): DomainEventCollector {
  const events = initialEvents.map(cloneDomainEvent);

  return {
    append(event) {
      events.push(cloneDomainEvent(event));
    },
    list() {
      return events.map(cloneDomainEvent);
    },
    clear() {
      events.length = 0;
    },
  };
}

export function createInMemoryCorePorts(initialRooms: readonly RoomAggregate[] = []): CorePorts {
  return {
    rooms: createInMemoryRoomRepository(initialRooms),
    housekeepingTasks: createInMemoryHousekeepingTaskRepository(),
    maintenanceTickets: createInMemoryMaintenanceTicketRepository(),
    audits: createInMemoryAuditRepository(),
    idempotency: createInMemoryIdempotencyRepository(),
    events: createInMemoryDomainEventCollector(),
  };
}

function createProjectionFreshness(generatedAt: string, status: ReadModelStatus): ProjectionFreshness {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-read-model-current' : 'room-not-found',
  };
}

function buildCommandProjection(input: {
  readonly commandType: PmsCommandType;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
  readonly housekeepingTask?: HousekeepingTask;
  readonly maintenanceTicket?: MaintenanceTicket;
}): CommandProjection {
  const roomLedger: RoomLedgerProjection = {
    schemaVersion: pmsProjectionSchemaVersion,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    ...(input.roomType ? { roomType: input.roomType } : {}),
    ...(input.zone ? { zone: input.zone } : {}),
    ...(input.sortKey ? { sortKey: input.sortKey } : {}),
    status: { ...input.status },
    roomCode: deriveRoomCode({
      roomNumber: input.roomNumber,
      occupancyStatus: input.status.occupancy,
      cleaningStatus: input.status.cleaning,
      saleStatus: input.status.sale,
    }),
    lastActor: { ...input.auditEntry.actor },
    lastReason: input.auditEntry.reason,
    lastUpdatedAt: input.auditEntry.occurredAt,
  };
  const housekeepingTask: HousekeepingTaskProjection | undefined = input.housekeepingTask
    ? { ...input.housekeepingTask }
    : undefined;
  const maintenanceTicket: MaintenanceTicketProjection | undefined = input.maintenanceTicket
    ? { ...input.maintenanceTicket }
    : undefined;
  const operationLog: OperationLogProjection = {
    auditId: input.auditEntry.auditId,
    commandType: input.commandType,
    roomId: input.auditEntry.roomId,
    actor: { ...input.auditEntry.actor },
    source: input.auditEntry.source,
    reason: input.auditEntry.reason,
    idempotencyKey: input.auditEntry.idempotencyKey,
    correlationId: input.auditEntry.correlationId,
    occurredAt: input.auditEntry.occurredAt,
    domainEventTypes: input.events.map((event) => event.type),
  };

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    commandType: input.commandType,
    mode: 'confirm',
    correlationId: input.auditEntry.correlationId,
    idempotencyKey: input.auditEntry.idempotencyKey,
    roomLedger,
    ...(housekeepingTask ? { housekeepingTask } : {}),
    ...(maintenanceTicket ? { maintenanceTicket } : {}),
    operationLog,
  };
}

function cloneRoom(room: RoomAggregate): RoomAggregate {
  return { ...room };
}

function cloneHousekeepingTask(task: HousekeepingTask): HousekeepingTask {
  return { ...task };
}

function cloneMaintenanceTicket(ticket: MaintenanceTicket): MaintenanceTicket {
  return { ...ticket };
}

function cloneAuditEntry(entry: AuditEntry): AuditEntry {
  return { ...entry, actor: { ...entry.actor } };
}

function cloneDomainEvent(event: DomainEvent): DomainEvent {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
    };
  }

  if (event.type === 'HousekeepingTaskCreated') {
    return {
      ...event,
      actor: { ...event.actor },
      task: { ...event.task },
    };
  }

  if (
    event.type === 'HousekeepingCompleted' ||
    event.type === 'HousekeepingInspectionPassed' ||
    event.type === 'HousekeepingInspectionFailed' ||
    event.type === 'HousekeepingReworkCompleted'
  ) {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
      ...(event.task ? { task: { ...event.task } } : {}),
    };
  }

  if (event.type === 'MaintenanceReported' || event.type === 'MaintenanceCompleted') {
    return {
      ...event,
      actor: { ...event.actor },
      previousStatus: { ...event.previousStatus },
      nextStatus: { ...event.nextStatus },
      ticket: { ...event.ticket },
    };
  }

  return {
    ...event,
    actor: { ...event.actor },
    previousStatus: { ...event.previousStatus },
    nextStatus: { ...event.nextStatus },
  };
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

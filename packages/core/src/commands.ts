import {
  checkoutableOccupancyStatuses,
  type AuditEntry,
  type CheckInCommand,
  type CheckOutCommand,
  type CleaningStatus,
  type DomainError,
  type DomainEvent,
  type HousekeepingDoneCommand,
  type HousekeepingInspectionCommand,
  type HousekeepingReworkCommand,
  type HousekeepingTask,
  type MaintenanceDoneCommand,
  type MaintenanceSeverity,
  type MaintenanceTicket,
  type PmsCommandDryRunPlan,
  type ReportMaintenanceCommand,
  type RestoreSellableCommand,
  type RoomStatus,
  validateCommandMeta,
} from '@pms-platform/contracts';
import {
  checkInNextStatusForRoom,
  checkoutNextStatusForRoom,
  createCheckoutCleaningTask,
  createHousekeepingTask,
  createMaintenanceTicket,
  type RoomAggregate,
  roomStateFromAggregate,
} from './model.js';
import { type CorePorts } from './ports.js';
import {
  type CheckInResult,
  type CheckOutResult,
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
  type PmsCommandResult,
} from './results.js';

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

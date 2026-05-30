import {
type AuditEntry,
type CleaningStatus,
type DomainError,
type DomainEvent,
type HousekeepingDoneCommand,
type HousekeepingInspectionCommand,
type HousekeepingMarkDirtyCommand,
type HousekeepingReworkCommand,
type HousekeepingTask,
type MaintenanceDoneCommand,
type MaintenanceSeverity,
type MaintenanceTicket,
type PmsCommandDryRunPlan,
type ReportMaintenanceCommand,
type RestoreSellableCommand,
type RoomStatus,
validateCommandMeta
} from '@pms-platform/contracts';
import {
type RoomAggregate,
roomStateFromAggregate
} from '../model.js';
import { type CorePorts } from '../ports.js';
import {
type CorePmsCommandConfirmResult,
type PmsCommandResult
} from '../results.js';

export type ExtendedCommand =
  | HousekeepingDoneCommand
  | HousekeepingInspectionCommand
  | HousekeepingReworkCommand
  | HousekeepingMarkDirtyCommand
  | ReportMaintenanceCommand
  | MaintenanceDoneCommand
  | RestoreSellableCommand;

export interface ExecuteRoomCommandOptions<TCommand extends ExtendedCommand> {
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

export function executeRoomCommand<TCommand extends ExtendedCommand>(
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

export function findActiveHousekeepingTaskForRoom(ports: CorePorts, roomId: string): HousekeepingTask | undefined {
  return ports.housekeepingTasks
    .list()
    .filter((task) => task.roomId === roomId && task.status !== 'done' && task.status !== 'cancelled')
    .at(-1);
}

export function completeHousekeepingTask(task: HousekeepingTask, nextCleaningStatus: CleaningStatus, completedAt: string): HousekeepingTask {
  if (nextCleaningStatus === 'inspection') {
    return { ...task, status: 'inspection' };
  }
  if (nextCleaningStatus === 'rework') {
    return { ...task, status: 'rework' };
  }
  return { ...task, status: 'done', completedAt };
}

export function normalizeMaintenanceSeverity(value: MaintenanceSeverity | undefined): MaintenanceSeverity {
  return value ?? 'Medium';
}

export function maintenanceRequiresStopSell(command: ReportMaintenanceCommand): boolean {
  return command.stopSellRequested === true || command.severity === 'StopSell';
}

export function findMaintenanceTicket(ports: CorePorts, roomId: string, ticketId?: string): MaintenanceTicket | undefined {
  if (ticketId) {
    const ticket = ports.maintenanceTickets.get(ticketId);
    return ticket?.roomId === roomId ? ticket : undefined;
  }
  return ports.maintenanceTickets
    .list()
    .filter((ticket) => ticket.roomId === roomId && ticket.status !== 'resolved')
    .at(-1);
}

export function safeIdSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

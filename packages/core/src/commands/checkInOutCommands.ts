import {
type AuditEntry,
type CheckInCommand,
checkoutableOccupancyStatuses,
type CheckOutCommand,
type DomainError,
type DomainEvent,
validateCommandMeta
} from '@pms-platform/contracts';
import {
checkInNextStatusForRoom,
checkoutNextStatusForRoom,
createCheckoutCleaningTask,
type RoomAggregate,
roomStateFromAggregate
} from '../model.js';
import { type CorePorts } from '../ports.js';
import {
type CheckInResult,
type CheckOutResult,
type CoreCheckInConfirmResult,
type CoreCheckOutConfirmResult
} from '../results.js';
import { safeIdSuffix } from './roomCommandExecutor.js';
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

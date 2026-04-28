import { describe, expect, it } from 'vitest';
import { checkinContractFixtures, checkoutContractFixtures, type CheckInCommand, type CheckOutCommand } from '@pms-platform/contracts';
import {
  buildCheckInProjection,
  buildCheckOutProjection,
  checkIn,
  checkOut,
  createCheckoutCleaningTask,
  createInMemoryCorePorts,
  createInMemoryDomainEventCollector,
  createInMemoryIdempotencyRepository,
  createInMemoryRoomRepository,
  deriveRoomCode,
  describeCoreContractBoundary,
  getDashboardReadModel,
  getRoomReadModel,
  roomAggregateFromState,
  roomStateFromAggregate,
  supportedCleaningStatuses,
  supportedOccupancyStatuses,
  supportedSaleStatuses,
  validateCheckInDomainInput,
  validateCheckoutDomainInput,
  type CorePorts,
  type RoomAggregate,
} from '../src/index.js';

const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const occupiedRoom: RoomAggregate = {
  roomId: 'room-1002',
  roomNumber: '1002',
  occupancyStatus: 'occupied',
  cleaningStatus: 'clean',
  saleStatus: 'outOfOrder',
};

const vacantCleanRoom: RoomAggregate = {
  roomId: 'room-1003',
  roomNumber: '1003',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const vacantDirtyRoom: RoomAggregate = {
  roomId: 'room-1004',
  roomNumber: '1004',
  occupancyStatus: 'vacant',
  cleaningStatus: 'dirty',
  saleStatus: 'sellable',
};

describe('core contract boundary', () => {
  it('consumes PMS contracts through the workspace package import', () => {
    expect(describeCoreContractBoundary()).toEqual({
      packageName: '@pms-platform/core',
      supportedCommandType: 'CHECK_OUT',
      supportedCommandTypes: ['CHECK_IN', 'CHECK_OUT'],
      supportedReadModels: ['pms_get_room', 'pms_dashboard'],
      supportedExecutionModes: ['dryRun', 'confirm'],
    });
  });
});

describe('room domain model', () => {
  it('supports checkout-relevant room statuses and derives a stable room code', () => {
    expect(supportedOccupancyStatuses).toEqual(['occupied', 'dueOut', 'vacant']);
    expect(supportedCleaningStatuses).toEqual(['clean', 'dirty']);
    expect(supportedSaleStatuses).toEqual(['sellable', 'outOfOrder', 'outOfService']);

    expect(deriveRoomCode(dueOutRoom)).toBe('1001:dueOut:clean:sellable');
    expect(
      deriveRoomCode({
        roomNumber: '1002',
        occupancyStatus: 'vacant',
        cleaningStatus: 'dirty',
        saleStatus: 'outOfService',
      }),
    ).toBe('1002:vacant:dirty:outOfService');
  });

  it('maps between contract RoomState and core RoomAggregate without presentation fields', () => {
    const aggregate = roomAggregateFromState(checkoutContractFixtures.room);

    expect(aggregate).toEqual(dueOutRoom);
    expect(roomStateFromAggregate(aggregate)).toEqual(checkoutContractFixtures.room);
  });
});

describe('housekeeping task model', () => {
  it('creates checkout-cleaning tasks with PMS metadata', () => {
    const task = createCheckoutCleaningTask({
      taskId: 'task-1',
      roomId: dueOutRoom.roomId,
      reason: checkoutContractFixtures.dryRunCommand.meta.reason,
      correlationId: checkoutContractFixtures.dryRunCommand.meta.correlationId,
      createdAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
    });

    expect(task).toEqual({
      taskId: 'task-1',
      roomId: 'room-1001',
      kind: 'checkout-cleaning',
      status: 'pending',
      reason: 'Guest departed and returned room cards.',
      correlationId: 'corr-checkout-room-1001',
      createdAt: '2026-04-25T00:00:00.000Z',
    });
  });
});

describe('domain validation helpers', () => {
  it('validates command metadata and checkoutable room state without executing checkout', () => {
    expect(validateCheckoutDomainInput(checkoutContractFixtures.dryRunCommand, dueOutRoom)).toEqual([]);

    expect(validateCheckoutDomainInput(checkoutContractFixtures.dryRunCommand, undefined)).toEqual([
      {
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
        field: 'roomId',
      },
    ]);

    expect(
      validateCheckoutDomainInput(checkoutContractFixtures.dryRunCommand, {
        ...dueOutRoom,
        occupancyStatus: 'vacant',
      }),
    ).toEqual([
      {
        code: 'ROOM_NOT_CHECKOUTABLE',
        message: 'Room is not in a checkoutable occupancy state.',
        field: 'room.occupancyStatus',
      },
    ]);
  });

  it('validates check-in eligibility without presentation-specific fields', () => {
    expect(validateCheckInDomainInput(checkinCommandForRoom(vacantCleanRoom.roomId), vacantCleanRoom)).toEqual([]);

    expect(validateCheckInDomainInput(checkinCommandForRoom('missing-room'), undefined)).toEqual([
      {
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
        field: 'roomId',
      },
    ]);

    expect(validateCheckInDomainInput(checkinCommandForRoom(occupiedRoom.roomId), occupiedRoom)).toEqual([
      {
        code: 'ROOM_NOT_CHECKIN_ELIGIBLE',
        message: 'Room is not eligible for check-in.',
        field: 'room.status',
      },
    ]);
    expect(validateCheckInDomainInput({ ...checkinCommandForRoom(vacantDirtyRoom.roomId), overrideDirtyRoom: true }, vacantDirtyRoom)).toEqual([]);
  });
});

describe('room and dashboard read models', () => {
  it('returns a PMS-owned one-room read model with task and freshness summary', () => {
    const ports = createInMemoryCorePorts([dueOutRoom, vacantCleanRoom]);
    const checkout = checkOut({ ...checkoutContractFixtures.dryRunCommand, meta: { ...checkoutContractFixtures.dryRunCommand.meta, mode: 'confirm' } }, ports);

    expect(checkout.ok).toBe(true);
    const readModel = getRoomReadModel('room-1001', ports, '2026-04-25T02:00:00.000Z');

    expect(readModel).toMatchObject({
      schemaVersion: 'pms-dashboard-mvp-v1',
      summaryStatus: 'fresh',
      room: {
        roomId: 'room-1001',
        roomNumber: '1001',
        status: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
      },
      projectionFreshness: {
        status: 'fresh',
      },
    });
    expect(readModel.housekeepingTasks).toHaveLength(1);
    expect(readModel.activeReservation).toBeUndefined();
    expect(readModel.maintenanceTickets).toEqual([]);
  });

  it('returns dashboard counts and queues without mutating PMS state', () => {
    const ports = createInMemoryCorePorts([dueOutRoom, occupiedRoom, vacantCleanRoom, vacantDirtyRoom]);
    const before = snapshotPorts(ports);

    const readModel = getDashboardReadModel(ports, '2026-04-25T02:30:00.000Z');

    expect(readModel).toMatchObject({
      schemaVersion: 'pms-dashboard-mvp-v1',
      summaryStatus: 'fresh',
      counts: {
        totalRooms: 4,
        vacantClean: 1,
        vacantDirty: 1,
        inHouse: 1,
        dueOut: 1,
        stopSell: 1,
      },
      queues: {
        cleaning: 0,
        inspection: 0,
        pendingOperationRequests: 0,
        failedOperationRequests: 0,
      },
    });
    expect(snapshotPorts(ports)).toEqual(before);
  });
});

describe('check-in dry-run and confirm execution', () => {
  it('returns a structural check-in dry-run without mutating ports', () => {
    const ports = createInMemoryCorePorts([vacantCleanRoom]);
    const before = snapshotPorts(ports, checkinContractFixtures.dryRunCommand.meta.idempotencyKey);

    const result = checkIn(checkinContractFixtures.dryRunCommand, ports);

    expect(result).toEqual({
      ok: true,
      mode: 'dryRun',
      plan: {
        commandType: 'CHECK_IN',
        roomId: 'room-1003',
        roomNumber: '1003',
        currentStatus: {
          occupancy: 'vacant',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'occupied',
          cleaning: 'clean',
          sale: 'sellable',
        },
        overrideDirtyRoom: false,
        warnings: [],
        events: ['RoomCheckedIn'],
        reason: 'Guest arrived with verified reservation.',
        correlationId: 'corr-checkin-room-1003',
        idempotencyKey: 'checkin-room-1003-2026-04-25',
        requestedAt: '2026-04-25T01:00:00.000Z',
        actor: checkinContractFixtures.actor,
      },
    });
    expect(snapshotPorts(ports, checkinContractFixtures.dryRunCommand.meta.idempotencyKey)).toEqual(before);
  });

  it('confirms check-in through PMS state, audit, event, and idempotency only', () => {
    const ports = createInMemoryCorePorts([vacantCleanRoom]);
    const command = confirmCheckInCommand(vacantCleanRoom.roomId);

    const result = checkIn(command, ports);
    const repeated = checkIn(command, ports);

    expect(result).toEqual(repeated);
    expect(result).toMatchObject({
      ok: true,
      mode: 'confirm',
      result: {
        commandType: 'CHECK_IN',
        roomId: 'room-1003',
        previousStatus: {
          occupancy: 'vacant',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'occupied',
          cleaning: 'clean',
          sale: 'sellable',
        },
      },
    });
    expect(ports.rooms.get('room-1003')?.occupancyStatus).toBe('occupied');
    expect(ports.housekeepingTasks.list()).toHaveLength(0);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.events.list().map((event) => event.type)).toEqual(['RoomCheckedIn']);
  });

  it('requires explicit override for dirty-room check-in and rejects prose-like invalid metadata', () => {
    const ports = createInMemoryCorePorts([vacantDirtyRoom]);

    expect(checkIn(checkinCommandForRoom(vacantDirtyRoom.roomId), ports)).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [checkinContractFixtures.stableFailure],
    });

    const override = checkIn({ ...checkinCommandForRoom(vacantDirtyRoom.roomId), overrideDirtyRoom: true }, ports);
    expect(override).toMatchObject({
      ok: true,
      mode: 'dryRun',
      plan: {
        overrideDirtyRoom: true,
        warnings: ['DIRTY_ROOM_OVERRIDE_APPROVED'],
      },
    });

    expect(checkIn({ ...checkinCommandForRoom(vacantCleanRoom.roomId), meta: { ...checkinContractFixtures.dryRunCommand.meta, reason: ' ' } }, createInMemoryCorePorts([vacantCleanRoom]))).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [checkoutContractFixtures.stableFailure],
    });
  });
});

describe('checkout dry-run execution', () => {
  it('returns a structural dry-run plan for a due-out room without mutating ports', () => {
    const ports = createInMemoryCorePorts([dueOutRoom]);
    const before = snapshotPorts(ports);

    const result = checkOut(checkoutContractFixtures.dryRunCommand, ports);

    expect(result).toEqual({
      ok: true,
      mode: 'dryRun',
      plan: {
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        roomNumber: '1001',
        currentStatus: {
          occupancy: 'dueOut',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
        housekeepingTask: {
          roomId: 'room-1001',
          kind: 'checkout-cleaning',
          status: 'pending',
          reason: 'Guest departed and returned room cards.',
          correlationId: 'corr-checkout-room-1001',
        },
        events: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
        reason: 'Guest departed and returned room cards.',
        correlationId: 'corr-checkout-room-1001',
        idempotencyKey: 'checkout-room-1001-2026-04-25',
        requestedAt: '2026-04-25T00:00:00.000Z',
        actor: checkoutContractFixtures.actor,
      },
    });
    expect(snapshotPorts(ports)).toEqual(before);
  });

  it('returns a structural dry-run plan for an occupied room and preserves sale status', () => {
    const command = commandForRoom(occupiedRoom.roomId);
    const ports = createInMemoryCorePorts([occupiedRoom]);

    const result = checkOut(command, ports);

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'dryRun') {
      expect(result.plan.currentStatus).toEqual({
        occupancy: 'occupied',
        cleaning: 'clean',
        sale: 'outOfOrder',
      });
      expect(result.plan.nextStatus).toEqual({
        occupancy: 'vacant',
        cleaning: 'dirty',
        sale: 'outOfOrder',
      });
      expect(result.plan.housekeepingTask).toMatchObject({
        roomId: 'room-1002',
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
      });
      expect(result.plan.actor).toEqual(command.meta.actor);
      expect(result.plan.idempotencyKey).toBe(command.meta.idempotencyKey);
    }
  });

  it('returns stable dry-run errors for non-checkoutable and unknown rooms', () => {
    const vacantRoom: RoomAggregate = {
      ...dueOutRoom,
      occupancyStatus: 'vacant',
    };

    expect(checkOut(checkoutContractFixtures.dryRunCommand, createInMemoryCorePorts([vacantRoom]))).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [
        {
          code: 'ROOM_NOT_CHECKOUTABLE',
          message: 'Room is not in a checkoutable occupancy state.',
          field: 'room.occupancyStatus',
        },
      ],
    });

    expect(checkOut(commandForRoom('missing-room'), createInMemoryCorePorts([dueOutRoom]))).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [
        {
          code: 'ROOM_NOT_FOUND',
          message: 'Room was not found.',
          field: 'roomId',
        },
      ],
    });
  });

  it('returns stable errors for missing metadata fields and unsupported execution intent', () => {
    expect(checkOut(commandWithMeta({ reason: '   ' }), createInMemoryCorePorts([dueOutRoom]))).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [
        {
          code: 'MISSING_REASON',
          message: 'A reason is required for mutating PMS commands.',
          field: 'meta.reason',
        },
      ],
    });

    expect(checkOut(commandWithMeta({ idempotencyKey: '' }), createInMemoryCorePorts([dueOutRoom]))).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [
        {
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'An idempotency key is required for mutating PMS commands.',
          field: 'meta.idempotencyKey',
        },
      ],
    });

    expect(
      checkOut(commandWithMeta({ mode: undefined as unknown as CheckOutCommand['meta']['mode'] }), createInMemoryCorePorts([dueOutRoom])),
    ).toEqual({
      ok: false,
      mode: 'unsupported',
      errors: [
        {
          code: 'INVALID_EXECUTION_MODE',
          message: 'Command mode must be dryRun or confirm.',
          field: 'meta.mode',
        },
      ],
    });
  });
});

describe('checkout confirm execution', () => {
  it('confirms checkout for a due-out room with room mutation, task, audit, and events', () => {
    const command = commandWithMeta({ mode: 'confirm' });
    const ports = createInMemoryCorePorts([dueOutRoom]);

    const result = checkOut(command, ports);

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'confirm') {
      expect(result.result).toMatchObject({
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        roomNumber: '1001',
        previousStatus: {
          occupancy: 'dueOut',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
      });
      expect(result.result.housekeepingTask).toEqual({
        taskId: 'task-checkout-checkout-room-1001-2026-04-25',
        roomId: 'room-1001',
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
        createdAt: command.meta.requestedAt,
      });
      expect(result.result.auditEntry).toEqual({
        auditId: 'audit-checkout-checkout-room-1001-2026-04-25',
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        actor: command.meta.actor,
        source: command.meta.source,
        reason: command.meta.reason,
        idempotencyKey: command.meta.idempotencyKey,
        correlationId: command.meta.correlationId,
        occurredAt: command.meta.requestedAt,
      });
      expect(result.result.events).toEqual([
        {
          eventId: 'event-room-checked-out-checkout-room-1001-2026-04-25',
          type: 'RoomCheckedOut',
          aggregateId: 'room-1001',
          roomId: 'room-1001',
          previousStatus: result.result.previousStatus,
          nextStatus: result.result.nextStatus,
          occurredAt: command.meta.requestedAt,
          correlationId: command.meta.correlationId,
          idempotencyKey: command.meta.idempotencyKey,
          actor: command.meta.actor,
        },
        {
          eventId: 'event-housekeeping-task-created-checkout-room-1001-2026-04-25',
          type: 'HousekeepingTaskCreated',
          aggregateId: result.result.housekeepingTask.taskId,
          task: result.result.housekeepingTask,
          occurredAt: command.meta.requestedAt,
          correlationId: command.meta.correlationId,
          idempotencyKey: command.meta.idempotencyKey,
          actor: command.meta.actor,
        },
      ]);
    }

    expect(ports.rooms.get('room-1001')).toEqual({
      ...dueOutRoom,
      occupancyStatus: 'vacant',
      cleaningStatus: 'dirty',
    });
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.events.list().map((event) => event.type)).toEqual(['RoomCheckedOut', 'HousekeepingTaskCreated']);
    expect(ports.idempotency.has(command.meta.idempotencyKey)).toBe(true);
  });

  it('builds stable command projection objects for check-in and checkout integration', () => {
    const checkInPorts = createInMemoryCorePorts([vacantCleanRoom]);
    const checkInResult = checkIn(confirmCheckInCommand(vacantCleanRoom.roomId), checkInPorts);
    const checkOutPorts = createInMemoryCorePorts([dueOutRoom]);
    const checkOutResult = checkOut(commandWithMeta({ mode: 'confirm' }), checkOutPorts);

    expect(checkInResult.ok && checkInResult.mode === 'confirm' ? buildCheckInProjection(checkInResult.result) : undefined).toMatchObject({
      schemaVersion: 'pms-dashboard-mvp-v1',
      commandType: 'CHECK_IN',
      roomLedger: {
        roomId: 'room-1003',
        status: {
          occupancy: 'occupied',
          cleaning: 'clean',
          sale: 'sellable',
        },
      },
      operationLog: {
        commandType: 'CHECK_IN',
        domainEventTypes: ['RoomCheckedIn'],
      },
    });
    expect(checkOutResult.ok && checkOutResult.mode === 'confirm' ? buildCheckOutProjection(checkOutResult.result) : undefined).toMatchObject({
      schemaVersion: 'pms-dashboard-mvp-v1',
      commandType: 'CHECK_OUT',
      roomLedger: {
        roomId: 'room-1001',
        status: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
      },
      housekeepingTask: {
        roomId: 'room-1001',
        kind: 'checkout-cleaning',
      },
      operationLog: {
        commandType: 'CHECK_OUT',
        domainEventTypes: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
      },
    });
  });

  it('confirms checkout for occupied rooms and preserves sale status', () => {
    const command = {
      ...commandForRoom(occupiedRoom.roomId),
      meta: {
        ...commandForRoom(occupiedRoom.roomId).meta,
        mode: 'confirm' as const,
      },
    };
    const ports = createInMemoryCorePorts([occupiedRoom]);

    const result = checkOut(command, ports);

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'confirm') {
      expect(result.result.previousStatus).toEqual({
        occupancy: 'occupied',
        cleaning: 'clean',
        sale: 'outOfOrder',
      });
      expect(result.result.nextStatus).toEqual({
        occupancy: 'vacant',
        cleaning: 'dirty',
        sale: 'outOfOrder',
      });
    }
    expect(ports.rooms.get('room-1002')).toEqual({
      ...occupiedRoom,
      occupancyStatus: 'vacant',
      cleaningStatus: 'dirty',
    });
  });

  it('uses idempotency to prevent duplicate tasks, audits, events, and room mutation', () => {
    const command = commandWithMeta({ mode: 'confirm' });
    const ports = createInMemoryCorePorts([dueOutRoom]);
    const first = checkOut(command, ports);
    const afterFirst = snapshotPorts(ports, command.meta.idempotencyKey);

    const second = checkOut(command, ports);

    expect(second).toEqual(first);
    expect(snapshotPorts(ports, command.meta.idempotencyKey)).toEqual(afterFirst);
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.events.list()).toHaveLength(2);
  });

  it('returns stable errors for invalid confirm metadata and invalid room state', () => {
    expect(checkOut(commandWithMeta({ mode: 'confirm', reason: '' }), createInMemoryCorePorts([dueOutRoom]))).toEqual({
      ok: false,
      mode: 'confirm',
      errors: [
        {
          code: 'MISSING_REASON',
          message: 'A reason is required for mutating PMS commands.',
          field: 'meta.reason',
        },
      ],
    });

    expect(
      checkOut(commandWithMeta({ mode: 'confirm' }), createInMemoryCorePorts([{ ...dueOutRoom, occupancyStatus: 'vacant' }])),
    ).toEqual({
      ok: false,
      mode: 'confirm',
      errors: [
        {
          code: 'ROOM_NOT_CHECKOUTABLE',
          message: 'Room is not in a checkoutable occupancy state.',
          field: 'room.occupancyStatus',
        },
      ],
    });
  });
});

describe('replaceable in-memory ports', () => {
  it('stores rooms through repository interfaces and returns defensive copies', () => {
    const rooms = createInMemoryRoomRepository([dueOutRoom]);
    const room = rooms.get('room-1001');

    expect(room).toEqual(dueOutRoom);

    if (room) {
      rooms.save({ ...room, cleaningStatus: 'dirty' });
    }

    expect(rooms.get('room-1001')).toEqual({ ...dueOutRoom, cleaningStatus: 'dirty' });
    expect(rooms.list()).toEqual([{ ...dueOutRoom, cleaningStatus: 'dirty' }]);
  });

  it('collects task, audit, idempotency, and event state through replaceable ports', () => {
    const ports = createInMemoryCorePorts([dueOutRoom]);
    const task = createCheckoutCleaningTask({
      taskId: 'task-1',
      roomId: 'room-1001',
      reason: checkoutContractFixtures.dryRunCommand.meta.reason,
      correlationId: checkoutContractFixtures.dryRunCommand.meta.correlationId,
      createdAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
    });

    ports.housekeepingTasks.save(task);
    ports.audits.append({
      auditId: 'audit-1',
      commandType: 'CHECK_OUT',
      roomId: 'room-1001',
      actor: checkoutContractFixtures.dryRunCommand.meta.actor,
      source: checkoutContractFixtures.dryRunCommand.meta.source,
      reason: checkoutContractFixtures.dryRunCommand.meta.reason,
      idempotencyKey: checkoutContractFixtures.dryRunCommand.meta.idempotencyKey,
      correlationId: checkoutContractFixtures.dryRunCommand.meta.correlationId,
      occurredAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
    });
    ports.idempotency.save(checkoutContractFixtures.dryRunCommand.meta.idempotencyKey, {
      taskId: task.taskId,
    });
    ports.events.append({
      eventId: 'evt-1',
      type: 'HousekeepingTaskCreated',
      aggregateId: task.taskId,
      task,
      occurredAt: task.createdAt,
      correlationId: task.correlationId,
      idempotencyKey: checkoutContractFixtures.dryRunCommand.meta.idempotencyKey,
      actor: checkoutContractFixtures.dryRunCommand.meta.actor,
    });

    expect(ports.housekeepingTasks.list()).toEqual([task]);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.idempotency.has(checkoutContractFixtures.dryRunCommand.meta.idempotencyKey)).toBe(true);
    expect(ports.idempotency.get(checkoutContractFixtures.dryRunCommand.meta.idempotencyKey)).toEqual({
      taskId: 'task-1',
    });
    expect(ports.events.list().map((event) => event.type)).toEqual(['HousekeepingTaskCreated']);
  });

  it('keeps repository implementations behind interfaces for future persistence replacement', () => {
    const idempotency = createInMemoryIdempotencyRepository<{ readonly roomId: string }>();
    idempotency.save('key-1', { roomId: 'room-1001' });

    const events = createInMemoryDomainEventCollector();
    expect(idempotency.get('key-1')).toEqual({ roomId: 'room-1001' });
    expect(events.list()).toEqual([]);
  });
});

function checkinCommandForRoom(roomId: string): CheckInCommand {
  return {
    ...checkinContractFixtures.dryRunCommand,
    roomId,
    meta: {
      ...checkinContractFixtures.dryRunCommand.meta,
      idempotencyKey: `checkin-${roomId}`,
      correlationId: `corr-${roomId}`,
    },
  };
}

function confirmCheckInCommand(roomId: string): CheckInCommand {
  const command = checkinCommandForRoom(roomId);
  return {
    ...command,
    meta: {
      ...command.meta,
      mode: 'confirm',
    },
  };
}

function commandForRoom(roomId: string): CheckOutCommand {
  return {
    ...checkoutContractFixtures.dryRunCommand,
    roomId,
    meta: {
      ...checkoutContractFixtures.dryRunCommand.meta,
      idempotencyKey: `checkout-${roomId}`,
      correlationId: `corr-${roomId}`,
    },
  };
}

function commandWithMeta(metaPatch: Partial<CheckOutCommand['meta']>): CheckOutCommand {
  return {
    ...checkoutContractFixtures.dryRunCommand,
    meta: {
      ...checkoutContractFixtures.dryRunCommand.meta,
      ...metaPatch,
    },
  };
}

function snapshotPorts(ports: CorePorts, idempotencyKey = checkoutContractFixtures.dryRunCommand.meta.idempotencyKey) {
  return {
    rooms: ports.rooms.list(),
    housekeepingTasks: ports.housekeepingTasks.list(),
    audits: ports.audits.list(),
    idempotencyHasCheckout: ports.idempotency.has(idempotencyKey),
    idempotencyValue: ports.idempotency.get(idempotencyKey),
    events: ports.events.list(),
  };
}

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
  housekeepingDone,
  housekeepingInspection,
  housekeepingRework,
  maintenanceDone,
  reportMaintenance,
  restoreSellable,
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

function extendedMeta(mode: 'dryRun' | 'confirm', suffix: string) {
  return {
    actor: { type: 'human' as const, id: 'ops-1', displayName: 'Ops' },
    source: 'test' as const,
    reason: `test ${suffix}`,
    idempotencyKey: `idem-${suffix}`,
    correlationId: `corr-${suffix}`,
    requestedAt: '2026-04-28T00:00:00.000Z',
    mode,
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

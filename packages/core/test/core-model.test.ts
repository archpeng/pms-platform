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

describe('core contract boundary', () => {
  it('consumes PMS contracts through the workspace package import', () => {
    expect(describeCoreContractBoundary()).toEqual({
      packageName: '@pms-platform/core',
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
      supportedExecutionModes: ['dryRun', 'confirm'],
    });
  });
});



describe('room domain model', () => {
  it('supports checkout-relevant room statuses and derives a stable room code', () => {
    expect(supportedOccupancyStatuses).toEqual(['occupied', 'dueOut', 'vacant']);
    expect(supportedCleaningStatuses).toEqual(['clean', 'dirty', 'cleaning', 'inspection', 'rework']);
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

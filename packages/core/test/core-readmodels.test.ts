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

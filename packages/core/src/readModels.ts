import {
  pmsProjectionSchemaVersion,
  type DashboardReadModel,
  type ProjectionFreshness,
  type ReadModelStatus,
  type RoomReadModel,
} from '@pms-platform/contracts';
import { roomStateFromAggregate } from './model.js';
import { type CorePorts } from './ports.js';

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

function createProjectionFreshness(generatedAt: string, status: ReadModelStatus): ProjectionFreshness {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-read-model-current' : 'room-not-found',
  };
}

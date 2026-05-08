import {
  type CleaningStatus,
  type HousekeepingTask,
  type MaintenanceTicket,
  type OccupancyStatus,
  type RoomState,
  type RoomStatus,
  type SaleStatus,
} from '@pms-platform/contracts';

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

export const supportedOccupancyStatuses: readonly OccupancyStatus[] = ['occupied', 'dueOut', 'vacant'];
export const supportedCleaningStatuses: readonly CleaningStatus[] = ['clean', 'dirty', 'cleaning', 'inspection', 'rework'];
export const supportedSaleStatuses: readonly SaleStatus[] = ['sellable', 'outOfOrder', 'outOfService'];

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

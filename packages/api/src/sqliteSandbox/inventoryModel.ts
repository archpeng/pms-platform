import {
  type DomainEvent,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryDayRoom,
  type InventoryIntervalProjection,
  type InventorySourceRef,
  type InventorySummaryDayType,
  type ReservationReadModel,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxStayReadback,
} from '../localSandbox/model.js';

import {
  addBusinessDays,
  dateInRange,
  normalizeBusinessDate,
} from './dates.js';
import { sanitizeSlug } from './ids.js';
export function createProjectionFreshness(
  generatedAt: string,
  status: 'fresh' | 'unavailable',
): ReservationReadModel['projectionFreshness'] {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-read-model-current' : 'room-not-found',
  };
}

export function propertyCodeFromPropertyId(propertyId: string): string {
  return propertyId === 'property-small-hotel' ? 'small-hotel' : propertyId;
}

export function propertyDisplayName(propertyId: string): string {
  return propertyId === 'property-small-hotel'
    ? 'PMS 小型酒店样板'
    : propertyId;
}

export function propertyTimezone(propertyId: string): string {
  return propertyId === 'property-small-hotel' ? 'Asia/Shanghai' : 'UTC';
}

export function roomTypeIdFromDisplayName(roomType: string): string {
  if (roomType === '花园别墅') return 'room-type-garden-villa';
  if (roomType === '秘境洞穴') return 'room-type-cave';
  if (roomType === '花园套房') return 'room-type-garden-suite';
  return `room-type-${sanitizeSlug(roomType)}`;
}

export function roomTypeCodeFromRoomTypeId(roomTypeId: string): string {
  if (roomTypeId === 'room-type-garden-villa') return 'garden-villa';
  if (roomTypeId === 'room-type-cave') return 'cave';
  if (roomTypeId === 'room-type-garden-suite') return 'garden-suite';
  return roomTypeId.replace(/^room-type-/, '');
}

export function roomTypeDisplayName(roomTypeId: string): string {
  if (roomTypeId === 'room-type-garden-villa') return '花园别墅';
  if (roomTypeId === 'room-type-cave') return '秘境洞穴';
  if (roomTypeId === 'room-type-garden-suite') return '花园套房';
  return roomTypeId;
}

export function roomIdFromEvent(event: DomainEvent): string | undefined {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return event.roomId;
  }
  if (event.type === 'HousekeepingTaskCreated') {
    return event.task.roomId;
  }
  return event.roomId;
}

export function housekeepingTaskIdFromEvent(event: DomainEvent): string {
  if (event.type === 'HousekeepingTaskCreated') return event.task.taskId;
  if (
    (event.type === 'HousekeepingCompleted' ||
      event.type === 'HousekeepingInspectionPassed' ||
      event.type === 'HousekeepingInspectionFailed' ||
      event.type === 'HousekeepingReworkCompleted') &&
    event.task
  )
    return event.task.taskId;
  return event.aggregateId;
}

export function inventoryDayRoomForStatus(
  room: RoomAggregate,
  propertyId: string,
  businessDate: string,
  availabilityStatus: InventoryAvailabilityStatus,
  sourceRefs: readonly InventorySourceRef[],
  updatedAt: string,
): InventoryDayRoom {
  return {
    businessDate,
    propertyId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    ...(room.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
    ...(room.roomType ? { roomType: room.roomType } : {}),
    availabilityStatus,
    sourceRefs,
    updatedAt,
  };
}

export function findOccupiedStayForRoomDate(
  stays: readonly PmsSandboxStayReadback[],
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): PmsSandboxStayReadback | undefined {
  return stays.find((stay) => {
    if (stay.roomId !== roomId || stay.status !== 'inHouse') {
      return false;
    }
    const reservation = reservationsById.get(stay.reservationId);
    const startDate = normalizeBusinessDate(
      stay.checkedInAt ?? reservation?.arrivalDate ?? businessDate,
    );
    const endDate = normalizeBusinessDate(
      stay.checkedOutAt ??
        reservation?.departureDate ??
        addBusinessDays(businessDate, 1),
    );
    return dateInRange(businessDate, startDate, endDate);
  });
}

export function findReservedAllocationForRoomDate(
  allocations: readonly PmsSandboxReservationAllocationReadback[],
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): PmsSandboxReservationAllocationReadback | undefined {
  return allocations.find((allocation) => {
    const reservation = reservationsById.get(allocation.reservationId);
    if (
      allocation.roomId !== roomId ||
      !reservation ||
      reservation.status === 'cancelled' ||
      reservation.status === 'checkedOut'
    ) {
      return false;
    }
    return dateInRange(businessDate, allocation.startDate, allocation.endDate);
  });
}

export function findReservedReservationForRoomDate(
  reservationsById: ReadonlyMap<string, ReservationReadModel>,
  roomId: string,
  businessDate: string,
): ReservationReadModel | undefined {
  return Array.from(reservationsById.values()).find((reservation) => {
    if (
      reservation.roomId !== roomId ||
      reservation.status === 'cancelled' ||
      reservation.status === 'checkedOut'
    ) {
      return false;
    }
    return dateInRange(
      businessDate,
      reservation.arrivalDate,
      reservation.departureDate,
    );
  });
}

export function compressInventoryIntervals(
  dayRooms: readonly InventoryDayRoom[],
  updatedAt: string,
): InventoryIntervalProjection[] {
  const intervals: InventoryIntervalProjection[] = [];
  const rowsByRoom = new Map<string, InventoryDayRoom[]>();
  for (const row of dayRooms) {
    rowsByRoom.set(row.roomId, [...(rowsByRoom.get(row.roomId) ?? []), row]);
  }

  for (const rows of rowsByRoom.values()) {
    rows.sort((left, right) =>
      left.businessDate.localeCompare(right.businessDate),
    );
    let current: InventoryDayRoom | undefined;
    let startDate: string | undefined;
    for (const row of rows) {
      if (!current) {
        current = row;
        startDate = row.businessDate;
        continue;
      }
      if (sameInventoryInterval(current, row)) {
        current = row;
        continue;
      }
      intervals.push(
        inventoryIntervalFromDayRoom(
          current,
          startDate!,
          row.businessDate,
          updatedAt,
        ),
      );
      current = row;
      startDate = row.businessDate;
    }
    if (current && startDate) {
      intervals.push(
        inventoryIntervalFromDayRoom(
          current,
          startDate,
          addBusinessDays(current.businessDate, 1),
          updatedAt,
        ),
      );
    }
  }

  return intervals;
}

export function sameInventoryInterval(
  left: InventoryDayRoom,
  right: InventoryDayRoom,
): boolean {
  return (
    left.availabilityStatus === right.availabilityStatus &&
    JSON.stringify(left.sourceRefs) === JSON.stringify(right.sourceRefs)
  );
}

export function inventoryIntervalFromDayRoom(
  row: InventoryDayRoom,
  startDate: string,
  endDate: string,
  updatedAt: string,
): InventoryIntervalProjection {
  const calendarKind = row.availabilityStatus;
  return {
    projectionId: `inventory-${row.roomId}-${startDate}-${endDate}-${calendarKind}`,
    propertyId: row.propertyId,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    ...(row.roomTypeId ? { roomTypeId: row.roomTypeId } : {}),
    ...(row.roomType ? { roomType: row.roomType } : {}),
    startDate,
    endDate,
    calendarKind,
    sellableStatus: calendarKind === 'blocked' ? 'outOfOrder' : 'sellable',
    title: `${row.roomNumber} ${calendarKind}`,
    sourceRefs: row.sourceRefs,
    updatedAt,
  };
}

export function summarizeInventoryDayRooms(
  dayRooms: readonly InventoryDayRoom[],
  updatedAt: string,
): InventorySummaryDayType[] {
  const summaries = new Map<string, InventorySummaryDayType>();
  for (const row of dayRooms) {
    const roomTypeId = row.roomTypeId ?? 'room-type-unknown';
    const key = `${row.businessDate}:${row.propertyId}:${roomTypeId}`;
    const current = summaries.get(key) ?? {
      businessDate: row.businessDate,
      propertyId: row.propertyId,
      roomTypeId,
      ...(row.roomType ? { roomType: row.roomType } : {}),
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      blockedRooms: 0,
      reservedRooms: 0,
      updatedAt,
    };
    summaries.set(key, {
      ...current,
      totalRooms: current.totalRooms + 1,
      availableRooms:
        current.availableRooms +
        (row.availabilityStatus === 'available' ? 1 : 0),
      occupiedRooms:
        current.occupiedRooms + (row.availabilityStatus === 'occupied' ? 1 : 0),
      blockedRooms:
        current.blockedRooms + (row.availabilityStatus === 'blocked' ? 1 : 0),
      reservedRooms:
        current.reservedRooms + (row.availabilityStatus === 'reserved' ? 1 : 0),
    });
  }
  return Array.from(summaries.values()).sort(
    (left, right) =>
      left.businessDate.localeCompare(right.businessDate) ||
      left.roomTypeId.localeCompare(right.roomTypeId),
  );
}

export function inventoryBlockOverlaps(
  block: InventoryBlock,
  startDate: string,
  endDate: string,
): boolean {
  return block.startDate < endDate && (block.endDate ?? endDate) > startDate;
}

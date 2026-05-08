import {
  type InventoryBlock,
  type InventoryDayRoom,
  type InventoryHorizonRequest,
  type InventoryReadModel,
  type ReservationReadModel,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxStayReadback,
} from '../localSandbox/model.js';
import { SqliteSandboxInventoryDerivedStore } from './inventoryDerivedStore.js';
import {
  addBusinessDays,
  businessDateRange,
  compressInventoryIntervals,
  createProjectionFreshness,
  dateInRange,
  findOccupiedStayForRoomDate,
  findReservedAllocationForRoomDate,
  findReservedReservationForRoomDate,
  inventoryDayRoomForStatus,
  normalizeBusinessDate,
  normalizeInventoryHorizonDays,
  summarizeInventoryDayRooms,
} from './model.js';

export abstract class SqliteSandboxInventoryHorizonStore extends SqliteSandboxInventoryDerivedStore {
  rebuildInventory(
    options: Partial<InventoryHorizonRequest> = {},
  ): InventoryReadModel {
    return this.runInTransaction(() => this.rebuildInventoryHorizon(options));
  }

  inventoryIntervals(
    options: Partial<InventoryHorizonRequest> = {},
  ): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  inventorySummary(
    options: Partial<InventoryHorizonRequest> = {},
  ): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  protected rebuildInventoryHorizon(
    options: Partial<InventoryHorizonRequest> = {},
  ): InventoryReadModel {
    const generatedAt = this.now();
    const startDate = normalizeBusinessDate(options.startDate ?? generatedAt);
    const horizonDays = normalizeInventoryHorizonDays(options.horizonDays);
    const endDate = addBusinessDays(startDate, horizonDays);
    const rooms = this.listRooms();
    const reservations = this.listReservations();
    const reservationsById = new Map(
      reservations.map((reservation) => [
        reservation.reservationId,
        reservation,
      ]),
    );
    const allocations = this.listReservationAllocations();
    const stays = this.listStays();
    const allBlocks = this.listInventoryBlocks();

    this.clearInventoryDerivedTables(startDate, endDate);

    const dayRooms: InventoryDayRoom[] = [];
    for (const businessDate of businessDateRange(startDate, endDate)) {
      for (const room of rooms) {
        const dayRoom = this.deriveInventoryDayRoom({
          businessDate,
          endDate,
          room,
          blocks: allBlocks,
          reservationsById,
          allocations,
          stays,
          updatedAt: generatedAt,
        });
        this.saveInventoryDayRoom(dayRoom);
        dayRooms.push(dayRoom);
      }
    }

    for (const interval of compressInventoryIntervals(dayRooms, generatedAt)) {
      this.saveInventoryIntervalProjection(interval);
    }
    for (const summary of summarizeInventoryDayRooms(dayRooms, generatedAt)) {
      this.saveInventorySummaryDayType(summary);
    }

    this.inventoryDirty = false;
    const filteredDayRooms = this.listInventoryDayRooms(
      startDate,
      endDate,
      options.roomId,
    );
    const summaryRoomTypeIds = options.roomId
      ? new Set(
          filteredDayRooms.map((row) => row.roomTypeId ?? 'room-type-unknown'),
        )
      : undefined;
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt,
      startDate,
      endDate,
      horizonDays,
      summaryStatus: 'fresh',
      blocks: this.listInventoryBlocks(options.roomId),
      dayRooms: filteredDayRooms,
      intervals: this.listInventoryIntervalProjection(
        startDate,
        endDate,
        options.roomId,
      ),
      summaries: this.listInventorySummaryDayType(
        startDate,
        endDate,
        summaryRoomTypeIds,
      ),
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }

  protected deriveInventoryDayRoom(input: {
    readonly businessDate: string;
    readonly endDate: string;
    readonly room: RoomAggregate;
    readonly blocks: readonly InventoryBlock[];
    readonly reservationsById: ReadonlyMap<string, ReservationReadModel>;
    readonly allocations: readonly PmsSandboxReservationAllocationReadback[];
    readonly stays: readonly PmsSandboxStayReadback[];
    readonly updatedAt: string;
  }): InventoryDayRoom {
    const activeBlock = input.blocks.find(
      (block) =>
        block.roomId === input.room.roomId &&
        block.status === 'active' &&
        dateInRange(
          input.businessDate,
          block.startDate,
          block.endDate ?? input.endDate,
        ),
    );
    const occupiedStay = findOccupiedStayForRoomDate(
      input.stays,
      input.reservationsById,
      input.room.roomId,
      input.businessDate,
    );
    const reservedAllocation = findReservedAllocationForRoomDate(
      input.allocations,
      input.reservationsById,
      input.room.roomId,
      input.businessDate,
    );
    const reservedReservation = reservedAllocation
      ? undefined
      : findReservedReservationForRoomDate(
          input.reservationsById,
          input.room.roomId,
          input.businessDate,
        );
    const propertyId = input.room.propertyId ?? 'property-small-hotel';

    if (activeBlock) {
      return inventoryDayRoomForStatus(
        input.room,
        propertyId,
        input.businessDate,
        'blocked',
        [
          {
            sourceType: 'inventory_block',
            sourceId: activeBlock.blockId,
            label: activeBlock.reason,
          },
        ],
        input.updatedAt,
      );
    }
    if (input.room.saleStatus !== 'sellable') {
      return inventoryDayRoomForStatus(
        input.room,
        propertyId,
        input.businessDate,
        'blocked',
        [
          {
            sourceType: 'room_status',
            sourceId: input.room.roomId,
            label: input.room.saleStatus,
          },
        ],
        input.updatedAt,
      );
    }
    if (occupiedStay) {
      const reservation = input.reservationsById.get(
        occupiedStay.reservationId,
      );
      return inventoryDayRoomForStatus(
        input.room,
        propertyId,
        input.businessDate,
        'occupied',
        [
          {
            sourceType: 'stay',
            sourceId: occupiedStay.stayId,
            label: reservation?.reservationCode,
          },
        ],
        input.updatedAt,
      );
    }
    if (reservedAllocation) {
      const reservation = input.reservationsById.get(
        reservedAllocation.reservationId,
      );
      return inventoryDayRoomForStatus(
        input.room,
        propertyId,
        input.businessDate,
        'reserved',
        [
          {
            sourceType: 'reservation',
            sourceId: reservedAllocation.reservationId,
            label: reservation?.reservationCode,
          },
        ],
        input.updatedAt,
      );
    }
    if (reservedReservation) {
      return inventoryDayRoomForStatus(
        input.room,
        propertyId,
        input.businessDate,
        'reserved',
        [
          {
            sourceType: 'reservation',
            sourceId: reservedReservation.reservationId,
            label: reservedReservation.reservationCode,
          },
        ],
        input.updatedAt,
      );
    }
    return inventoryDayRoomForStatus(
      input.room,
      propertyId,
      input.businessDate,
      'available',
      [],
      input.updatedAt,
    );
  }
}

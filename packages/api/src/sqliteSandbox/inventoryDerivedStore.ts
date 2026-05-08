import {
  type InventoryDayRoom,
  type InventoryIntervalProjection,
  type InventorySummaryDayType,
} from '@pms-platform/contracts';
import { SqliteSandboxInventoryBlockStore } from './inventoryBlockStore.js';
import {
  InventoryDayRoomRow,
  InventoryIntervalProjectionRow,
  InventorySummaryDayTypeRow,
  inventoryDayRoomFromRow,
  inventoryIntervalProjectionFromRow,
  inventorySummaryDayTypeFromRow,
} from './model.js';

export abstract class SqliteSandboxInventoryDerivedStore extends SqliteSandboxInventoryBlockStore {
  protected clearInventoryDerivedTables(
    startDate: string,
    endDate: string,
  ): void {
    this.db
      .prepare(
        'DELETE FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ?',
      )
      .run(startDate, endDate);
    this.db
      .prepare(
        'DELETE FROM inventory_interval_projection WHERE start_date < ? AND end_date > ?',
      )
      .run(endDate, startDate);
    this.db
      .prepare(
        'DELETE FROM inventory_day_room WHERE business_date >= ? AND business_date < ?',
      )
      .run(startDate, endDate);
  }

  protected saveInventoryDayRoom(row: InventoryDayRoom): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_day_room (
            business_date, property_id, room_id, room_number, room_type_id, room_type, availability_status, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, room_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            availability_status = excluded.availability_status,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        row.businessDate,
        row.propertyId,
        row.roomId,
        row.roomNumber,
        row.roomTypeId ?? null,
        row.roomType ?? null,
        row.availabilityStatus,
        JSON.stringify(row.sourceRefs),
        row.updatedAt,
      );
  }

  protected listInventoryDayRooms(
    startDate: string,
    endDate: string,
    roomId?: string,
  ): InventoryDayRoom[] {
    const rows = roomId
      ? (this.db
          .prepare(
            'SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? AND room_id = ? ORDER BY business_date, room_id',
          )
          .all(startDate, endDate, roomId) as unknown as InventoryDayRoomRow[])
      : (this.db
          .prepare(
            'SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_id',
          )
          .all(startDate, endDate) as unknown as InventoryDayRoomRow[]);
    return rows.map(inventoryDayRoomFromRow);
  }

  protected saveInventoryIntervalProjection(
    interval: InventoryIntervalProjection,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_interval_projection (
            projection_id, property_id, room_id, room_number, room_type_id, room_type, start_date, end_date,
            calendar_kind, sellable_status, title, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(projection_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            calendar_kind = excluded.calendar_kind,
            sellable_status = excluded.sellable_status,
            title = excluded.title,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        interval.projectionId,
        interval.propertyId,
        interval.roomId,
        interval.roomNumber,
        interval.roomTypeId ?? null,
        interval.roomType ?? null,
        interval.startDate,
        interval.endDate,
        interval.calendarKind,
        interval.sellableStatus,
        interval.title,
        JSON.stringify(interval.sourceRefs),
        interval.updatedAt,
      );
  }

  protected listInventoryIntervalProjection(
    startDate: string,
    endDate: string,
    roomId?: string,
  ): InventoryIntervalProjection[] {
    const rows = roomId
      ? (this.db
          .prepare(
            'SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? AND room_id = ? ORDER BY start_date, room_id, projection_id',
          )
          .all(
            endDate,
            startDate,
            roomId,
          ) as unknown as InventoryIntervalProjectionRow[])
      : (this.db
          .prepare(
            'SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? ORDER BY start_date, room_id, projection_id',
          )
          .all(
            endDate,
            startDate,
          ) as unknown as InventoryIntervalProjectionRow[]);
    return rows.map(inventoryIntervalProjectionFromRow);
  }

  protected saveInventorySummaryDayType(
    summary: InventorySummaryDayType,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_summary_day_type (
            business_date, property_id, room_type_id, room_type, total_rooms, available_rooms, occupied_rooms, blocked_rooms, reserved_rooms, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, property_id, room_type_id) DO UPDATE SET
            room_type = excluded.room_type,
            total_rooms = excluded.total_rooms,
            available_rooms = excluded.available_rooms,
            occupied_rooms = excluded.occupied_rooms,
            blocked_rooms = excluded.blocked_rooms,
            reserved_rooms = excluded.reserved_rooms,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        summary.businessDate,
        summary.propertyId,
        summary.roomTypeId,
        summary.roomType ?? null,
        summary.totalRooms,
        summary.availableRooms,
        summary.occupiedRooms,
        summary.blockedRooms,
        summary.reservedRooms,
        summary.updatedAt,
      );
  }

  protected listInventorySummaryDayType(
    startDate: string,
    endDate: string,
    roomTypeIds?: ReadonlySet<string>,
  ): InventorySummaryDayType[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_type_id',
      )
      .all(startDate, endDate) as unknown as InventorySummaryDayTypeRow[];
    return rows
      .map(inventorySummaryDayTypeFromRow)
      .filter((row) => !roomTypeIds || roomTypeIds.has(row.roomTypeId));
  }
}

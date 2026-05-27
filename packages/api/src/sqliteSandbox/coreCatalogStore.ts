import { type RoomAggregate } from '@pms-platform/core';
import {
  pmsProjectionSchemaVersion,
  type HotelProfileReadModel,
  type ProjectionFreshness,
  type RoomTypeCatalogItem,
  type RoomTypeCatalogReadModel,
} from '@pms-platform/contracts';
import {
  type PmsSandboxPropertyReadback,
  type PmsSandboxRoomTypeReadback,
} from '../localSandbox/model.js';
import { SqliteSandboxBase } from './baseStore.js';
import {
  RoomRow,
  propertyCodeFromPropertyId,
  propertyDisplayName,
  propertyTimezone,
  roomFromRow,
  roomTypeCodeFromRoomTypeId,
  roomTypeDisplayName,
  roomTypeIdFromDisplayName,
} from './model.js';

export abstract class SqliteSandboxCoreCatalogStore extends SqliteSandboxBase {
  protected abstract closeActiveStopSellBlocks(
    roomId: string,
    timestamp: string,
  ): void;

  protected getRoom(roomId: string): RoomAggregate | undefined {
    const row = this.db
      .prepare('SELECT * FROM rooms WHERE room_id = ?')
      .get(roomId) as RoomRow | undefined;
    return row ? roomFromRow(row) : undefined;
  }

  protected getRoomByNumber(
    roomNumber: string,
    propertyId?: string,
  ): RoomAggregate | undefined {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM rooms
          WHERE room_number = ?
            AND (? IS NULL OR property_id = ?)
          ORDER BY room_id
          LIMIT 1
        `,
      )
      .get(roomNumber, propertyId ?? null, propertyId ?? null) as
      | RoomRow
      | undefined;
    return row ? roomFromRow(row) : undefined;
  }

  protected getRoomsByRoomId(roomId: string): RoomAggregate[] {
    return this.getRoom(roomId) ? [this.getRoom(roomId)!] : [];
  }

  protected listRooms(): RoomAggregate[] {
    const rows = this.db
      .prepare('SELECT * FROM rooms ORDER BY room_number, room_id')
      .all() as unknown as RoomRow[];
    return rows.map(roomFromRow);
  }

  hotelProfile(propertyId: string | undefined, generatedAt: string): HotelProfileReadModel {
    const property = this.getCatalogProperty(propertyId);
    const catalog = this.roomTypeCatalog(property?.propertyId ?? propertyId, generatedAt);
    const roomTotal = catalog.roomTypes.reduce((total, roomType) => total + roomType.roomCount, 0);
    return {
      schemaVersion: pmsProjectionSchemaVersion,
      generatedAt,
      summaryStatus: property ? 'fresh' : 'unavailable',
      propertyId: property?.propertyId ?? propertyId ?? 'unknown',
      propertyName: property?.displayName ?? 'unknown',
      timeZone: property?.timezone ?? 'UTC',
      status: property?.status ?? 'unknown',
      roomTotal,
      roomTypes: catalog.roomTypes,
      projectionFreshness: catalogFreshness(generatedAt, property ? 'fresh' : 'unavailable'),
    };
  }

  roomTypeCatalog(propertyId: string | undefined, generatedAt: string): RoomTypeCatalogReadModel {
    const roomTypes = this.listActiveRoomTypeCatalog(propertyId);
    return {
      schemaVersion: pmsProjectionSchemaVersion,
      generatedAt,
      summaryStatus: 'fresh',
      ...(propertyId ? { propertyId } : {}),
      roomTypes,
      projectionFreshness: catalogFreshness(generatedAt, 'fresh'),
    };
  }

  protected saveRoom(room: RoomAggregate): void {
    const previous = this.getRoom(room.roomId);
    this.ensureCatalogForRoom(room);
    this.db
      .prepare(
        `
          INSERT INTO rooms (room_id, room_number, property_id, room_type_id, room_type, zone, sort_key, occupancy_status, cleaning_status, sale_status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(room_id) DO UPDATE SET
            room_number = excluded.room_number,
            property_id = excluded.property_id,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            zone = excluded.zone,
            sort_key = excluded.sort_key,
            occupancy_status = excluded.occupancy_status,
            cleaning_status = excluded.cleaning_status,
            sale_status = excluded.sale_status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        room.roomId,
        room.roomNumber,
        room.propertyId ?? null,
        room.roomTypeId ?? null,
        room.roomType ?? null,
        room.zone ?? null,
        room.sortKey ?? null,
        room.occupancyStatus,
        room.cleaningStatus,
        room.saleStatus,
        this.now(),
      );
    if (
      previous &&
      previous.saleStatus !== 'sellable' &&
      room.saleStatus === 'sellable'
    ) {
      this.closeActiveStopSellBlocks(room.roomId, this.now());
    }
    this.inventoryDirty = true;
  }

  protected seedCatalogFromRooms(rooms: readonly RoomAggregate[]): void {
    for (const room of rooms) {
      this.ensureCatalogForRoom(room);
    }
  }

  protected ensureCatalogForRoom(room: RoomAggregate): void {
    const timestamp = this.now();
    const propertyId = room.propertyId ?? 'property-small-hotel';
    const propertyCode = propertyCodeFromPropertyId(propertyId);
    this.db
      .prepare(
        `
          INSERT INTO properties (property_id, property_code, display_name, timezone, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(property_id) DO UPDATE SET
            property_code = excluded.property_code,
            display_name = excluded.display_name,
            timezone = excluded.timezone,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        propertyId,
        propertyCode,
        propertyDisplayName(propertyId),
        propertyTimezone(propertyId),
        'active',
        timestamp,
        timestamp,
      );

    if (!room.roomTypeId && !room.roomType) {
      return;
    }

    const roomTypeId =
      room.roomTypeId ??
      roomTypeIdFromDisplayName(room.roomType ?? '房型待补全');
    const roomTypeCode = roomTypeCodeFromRoomTypeId(roomTypeId);
    this.db
      .prepare(
        `
          INSERT INTO room_types (room_type_id, property_id, room_type_code, display_name, sort_key, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(room_type_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_type_code = excluded.room_type_code,
            display_name = excluded.display_name,
            sort_key = excluded.sort_key,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        roomTypeId,
        propertyId,
        roomTypeCode,
        room.roomType ?? roomTypeDisplayName(roomTypeId),
        roomTypeCode,
        'active',
        timestamp,
        timestamp,
      );
  }

  protected listProperties(): PmsSandboxPropertyReadback[] {
    const rows = this.db
      .prepare(
        'SELECT property_id, property_code, display_name, timezone, status FROM properties ORDER BY property_code, property_id',
      )
      .all() as Array<{
      property_id: string;
      property_code: string;
      display_name: string;
      timezone: string;
      status: string;
    }>;
    return rows.map((row) => ({
      propertyId: row.property_id,
      propertyCode: row.property_code,
      displayName: row.display_name,
      timezone: row.timezone,
      status: row.status,
    }));
  }

  private getCatalogProperty(propertyId: string | undefined): PmsSandboxPropertyReadback | undefined {
    const rows = this.listProperties();
    if (propertyId) return rows.find((property) => property.propertyId === propertyId);
    return rows[0];
  }

  private listActiveRoomTypeCatalog(propertyId: string | undefined): RoomTypeCatalogItem[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            rt.room_type_id,
            rt.room_type_code,
            rt.display_name,
            rt.status,
            COUNT(r.room_id) AS room_count,
            MIN(COALESCE(r.sort_key, r.room_number, rt.sort_key)) AS first_sort_key
          FROM room_types rt
          LEFT JOIN rooms r
            ON (
              r.room_type_id = rt.room_type_id
              OR (r.room_type_id IS NULL AND r.room_type = rt.display_name)
            )
            AND (r.property_id = rt.property_id OR r.property_id IS NULL)
          WHERE rt.status = 'active'
            AND (? IS NULL OR rt.property_id = ?)
          GROUP BY rt.room_type_id, rt.room_type_code, rt.display_name, rt.status, rt.sort_key
          ORDER BY first_sort_key, rt.sort_key, rt.room_type_code
        `,
      )
      .all(propertyId ?? null, propertyId ?? null) as Array<{
      room_type_id: string;
      room_type_code: string;
      display_name: string;
      status: string;
      room_count: number;
    }>;
    return rows.map((row) => ({
      roomTypeId: row.room_type_id,
      code: row.room_type_code,
      displayName: row.display_name,
      roomCount: row.room_count,
      status: row.status,
    }));
  }

  protected listRoomTypes(): PmsSandboxRoomTypeReadback[] {
    const rows = this.db
      .prepare(
        'SELECT room_type_id, property_id, room_type_code, display_name, sort_key, status FROM room_types ORDER BY sort_key, room_type_code',
      )
      .all() as Array<{
      room_type_id: string;
      property_id: string;
      room_type_code: string;
      display_name: string;
      sort_key: string;
      status: string;
    }>;
    return rows.map((row) => ({
      roomTypeId: row.room_type_id,
      propertyId: row.property_id,
      roomTypeCode: row.room_type_code,
      displayName: row.display_name,
      sortKey: row.sort_key,
      status: row.status,
    }));
  }
}

function catalogFreshness(generatedAt: string, status: ProjectionFreshness['status']): ProjectionFreshness {
  return {
    status,
    generatedAt,
    note: status === 'fresh' ? 'pms-catalog-current' : 'pms-catalog-unavailable',
  };
}

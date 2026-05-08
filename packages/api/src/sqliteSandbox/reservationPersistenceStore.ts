import {
  type ReservationReadModel,
  type StayStatus,
} from '@pms-platform/contracts';
import {
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxReservationImportRecord,
  type PmsSandboxStayReadback,
} from '../localSandbox/model.js';
import { SqliteSandboxCoreStore } from './coreStore.js';
import {
  ReservationRow,
  StayRow,
  createProjectionFreshness,
  optionalString,
  stayFromRow,
  stayIdForReservationRoom,
} from './model.js';

export abstract class SqliteSandboxReservationPersistenceStore extends SqliteSandboxCoreStore {
  protected listReservationAllocations(): PmsSandboxReservationAllocationReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          ORDER BY start_date, allocation_id
        `,
      )
      .all() as Array<{
      allocation_id: string;
      reservation_id: string;
      room_id?: string | null;
      room_number?: string | null;
      room_type_id?: string | null;
      room_type?: string | null;
      start_date: string;
      end_date: string;
      status: string;
    }>;
    return rows.map((row) => ({
      allocationId: row.allocation_id,
      reservationId: row.reservation_id,
      ...(row.room_id ? { roomId: row.room_id } : {}),
      ...(row.room_number ? { roomNumber: row.room_number } : {}),
      ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
      ...(row.room_type ? { roomType: row.room_type } : {}),
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    }));
  }

  protected listReservationAllocationsByRoomIds(
    roomIds: ReadonlySet<string>,
  ): PmsSandboxReservationAllocationReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservationAllocations().filter(
      (allocation) => allocation.roomId && roomIds.has(allocation.roomId),
    );
  }

  protected listStays(): PmsSandboxStayReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          ORDER BY s.created_at, s.stay_id
        `,
      )
      .all() as unknown as StayRow[];
    return rows.map(stayFromRow);
  }

  protected listStaysByRoomIds(
    roomIds: ReadonlySet<string>,
  ): PmsSandboxStayReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listStays().filter(
      (stay) => stay.roomId && roomIds.has(stay.roomId),
    );
  }

  protected saveReservationImportRecord(
    record: PmsSandboxReservationImportRecord,
  ): ReservationReadModel {
    const guestId = `guest-${record.reservationId}`;
    const createdAt = this.now();
    const room = record.roomId ? this.getRoom(record.roomId) : undefined;
    const propertyId =
      record.propertyId || room?.propertyId || 'property-small-hotel';
    const roomTypeId = record.roomTypeId ?? room?.roomTypeId;
    const roomType = record.roomType ?? room?.roomType;
    this.ensureCatalogForRoom({
      roomId: record.roomId ?? `room-import-${record.reservationCode}`,
      roomNumber:
        record.roomNumber ?? room?.roomNumber ?? record.reservationCode,
      propertyId,
      roomTypeId,
      roomType,
      zone: room?.zone,
      sortKey: room?.sortKey,
      occupancyStatus: room?.occupancyStatus ?? 'vacant',
      cleaningStatus: room?.cleaningStatus ?? 'clean',
      saleStatus: room?.saleStatus ?? 'sellable',
    });
    this.db
      .prepare(
        `
          INSERT INTO guests (guest_id, display_name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guest_id) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at
        `,
      )
      .run(guestId, record.guestDisplayName, createdAt, createdAt);
    this.db
      .prepare(
        `
          INSERT INTO reservations (
            reservation_id, reservation_code, property_id, guest_id, room_id, room_number,
            room_type_id, room_type, arrival_date, departure_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reservation_id) DO UPDATE SET
            reservation_code = excluded.reservation_code,
            property_id = excluded.property_id,
            guest_id = excluded.guest_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            arrival_date = excluded.arrival_date,
            departure_date = excluded.departure_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.reservationId,
        record.reservationCode,
        propertyId,
        guestId,
        record.roomId ?? null,
        record.roomNumber ?? null,
        roomTypeId ?? null,
        roomType ?? null,
        record.arrivalDate,
        record.departureDate,
        record.status,
        createdAt,
        createdAt,
      );
    this.inventoryDirty = true;

    if (record.allocation || record.roomId || record.roomNumber) {
      const allocation = {
        allocationId:
          record.allocation?.allocationId ?? `alloc-${record.reservationId}`,
        roomId: record.allocation?.roomId ?? record.roomId ?? room?.roomId,
        roomNumber:
          record.allocation?.roomNumber ??
          record.roomNumber ??
          room?.roomNumber,
        roomTypeId: record.allocation?.roomTypeId ?? roomTypeId,
        roomType: record.allocation?.roomType ?? roomType,
        startDate: record.allocation?.startDate ?? record.arrivalDate,
        endDate: record.allocation?.endDate ?? record.departureDate,
        status: record.allocation?.status ?? 'allocated',
      };
      this.saveReservationAllocation(
        record.reservationId,
        allocation,
        createdAt,
      );
    }

    if (record.stay) {
      this.saveStay(
        record.reservationId,
        {
          stayId:
            record.stay.stayId ??
            stayIdForReservationRoom(
              record.reservationId,
              record.stay.roomId ?? record.roomId ?? room?.roomId ?? 'unknown',
            ),
          roomId: record.stay.roomId ?? record.roomId ?? room?.roomId,
          roomNumber:
            record.stay.roomNumber ?? record.roomNumber ?? room?.roomNumber,
          checkedInAt: record.stay.checkedInAt,
          checkedOutAt: record.stay.checkedOutAt,
          status:
            record.stay.status ??
            (record.stay.checkedOutAt ? 'checkedOut' : 'inHouse'),
        },
        createdAt,
      );
    }

    const row = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
      )
      .get(record.reservationId) as unknown as ReservationRow;
    return this.reservationReadModelFromRow(row, createdAt);
  }

  protected saveReservationAllocation(
    reservationId: string,
    allocation: {
      allocationId: string;
      roomId?: string;
      roomNumber?: string;
      roomTypeId?: string;
      roomType?: string;
      startDate: string;
      endDate: string;
      status: string;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_room_allocations (
            allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(allocation_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        allocation.allocationId,
        reservationId,
        allocation.roomId ?? null,
        allocation.roomNumber ?? null,
        allocation.roomTypeId ?? null,
        allocation.roomType ?? null,
        allocation.startDate,
        allocation.endDate,
        allocation.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  protected saveStay(
    reservationId: string,
    stay: {
      stayId: string;
      roomId?: string;
      roomNumber?: string;
      checkedInAt?: string;
      checkedOutAt?: string;
      status: StayStatus;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO stays (stay_id, reservation_id, room_id, room_number, checked_in_at, checked_out_at, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stay_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            checked_in_at = excluded.checked_in_at,
            checked_out_at = excluded.checked_out_at,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        stay.stayId,
        reservationId,
        stay.roomId ?? null,
        stay.roomNumber ?? null,
        stay.checkedInAt ?? null,
        stay.checkedOutAt ?? null,
        stay.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  protected resolveStayReservation(
    reservationId?: string,
    reservationCode?: string,
  ): ReservationRow | undefined {
    const normalizedId = optionalString(reservationId);
    if (normalizedId) {
      const byId = this.getReservationRowById(normalizedId);
      if (byId) return byId;
    }
    const normalizedCode = optionalString(reservationCode);
    return normalizedCode
      ? this.getReservationRowByCode(normalizedCode)
      : undefined;
  }

  protected getReservationRowById(
    reservationId: string,
  ): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
      )
      .get(reservationId) as ReservationRow | undefined;
  }

  protected getReservationRowByCode(
    reservationCode: string,
  ): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode) as ReservationRow | undefined;
  }

  protected findLatestStay(filter: {
    readonly reservationId?: string;
    readonly roomId?: string;
    readonly status: StayStatus;
  }): PmsSandboxStayReadback | undefined {
    return this.listStays()
      .filter((stay) => stay.status === filter.status)
      .filter(
        (stay) =>
          !filter.reservationId || stay.reservationId === filter.reservationId,
      )
      .filter((stay) => !filter.roomId || stay.roomId === filter.roomId)
      .at(-1);
  }

  protected getLatestReservationAllocation(
    reservationId: string,
  ): PmsSandboxReservationAllocationReadback | undefined {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          WHERE reservation_id = ?
          ORDER BY updated_at DESC, allocation_id DESC
        `,
      )
      .all(reservationId) as Array<{
      allocation_id: string;
      reservation_id: string;
      room_id?: string | null;
      room_number?: string | null;
      room_type_id?: string | null;
      room_type?: string | null;
      start_date: string;
      end_date: string;
      status: string;
    }>;
    const row = rows[0];
    return row
      ? {
          allocationId: row.allocation_id,
          reservationId: row.reservation_id,
          ...(row.room_id ? { roomId: row.room_id } : {}),
          ...(row.room_number ? { roomNumber: row.room_number } : {}),
          ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
          ...(row.room_type ? { roomType: row.room_type } : {}),
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.status,
        }
      : undefined;
  }

  protected getLatestStay(
    reservationId: string,
  ): PmsSandboxStayReadback | undefined {
    const row = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          WHERE s.reservation_id = ?
          ORDER BY s.updated_at DESC, s.stay_id DESC
        `,
      )
      .get(reservationId) as StayRow | undefined;
    return row ? stayFromRow(row) : undefined;
  }

  protected reservationReadModelFromRow(
    row: ReservationRow,
    generatedAt: string,
  ): ReservationReadModel {
    const allocation = this.getLatestReservationAllocation(row.reservation_id);
    const stay = this.getLatestStay(row.reservation_id);
    return {
      reservationId: row.reservation_id,
      reservationCode: row.reservation_code,
      propertyId: row.property_id,
      ...(stay?.roomId
        ? { roomId: stay.roomId }
        : allocation?.roomId
          ? { roomId: allocation.roomId }
          : row.room_id
            ? { roomId: row.room_id }
            : {}),
      ...(stay?.roomNumber
        ? { roomNumber: stay.roomNumber }
        : allocation?.roomNumber
          ? { roomNumber: allocation.roomNumber }
          : row.room_number
            ? { roomNumber: row.room_number }
            : {}),
      ...(allocation?.roomTypeId
        ? { roomTypeId: allocation.roomTypeId }
        : row.room_type_id
          ? { roomTypeId: row.room_type_id }
          : {}),
      ...(allocation?.roomType
        ? { roomType: allocation.roomType }
        : row.room_type
          ? { roomType: row.room_type }
          : {}),
      guestDisplayName: row.display_name,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status:
        stay?.status === 'inHouse'
          ? 'checkedIn'
          : stay?.status === 'checkedOut'
            ? 'checkedOut'
            : row.status,
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }
}

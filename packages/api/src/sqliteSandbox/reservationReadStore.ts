import {
  type ReservationReadModel,
  type ReservationSearchQuery,
  type ReservationSearchReadModel,
  type RoomReservationContextReadModel,
  type TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  ReservationRow,
  createProjectionFreshness,
  sameBusinessDate,
} from './model.js';
import { SqliteSandboxReservationStayLifecycleStore } from './reservationStayLifecycleStore.js';
import { sqliteOptionalRow, sqliteRows } from './sqliteRows.js';

export abstract class SqliteSandboxReservationReadStore extends SqliteSandboxReservationStayLifecycleStore {
  getReservation(
    reservationCode: string,
    requestedAt: string,
  ): ReservationReadModel | undefined {
    const row = sqliteOptionalRow<ReservationRow>(this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode));
    return row ? this.reservationReadModelFromRow(row, requestedAt) : undefined;
  }

  searchReservations(
    query: ReservationSearchQuery,
    requestedAt: string,
  ): ReservationSearchReadModel {
    const limit = normalizeReservationSearchLimit(query.limit);
    const normalizedQuery = { ...query, limit };
    const conditions = ['g.display_name LIKE ?'];
    const params: Array<string | number> = [`%${query.guestDisplayName}%`];
    if (query.arrivalDateFrom) {
      conditions.push('r.arrival_date >= ?');
      params.push(query.arrivalDateFrom);
    }
    if (query.arrivalDateTo) {
      conditions.push('r.arrival_date <= ?');
      params.push(query.arrivalDateTo);
    }

    const rows = sqliteRows<ReservationRow>(this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY r.arrival_date DESC, r.reservation_code ASC
        `,
      )
      .all(...params));
    const reservations = rows
      .map((row) => this.reservationReadModelFromRow(row, requestedAt))
      .filter((reservation) => !query.status || reservation.status === query.status)
      .slice(0, limit);
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      query: normalizedQuery,
      summaryStatus: 'fresh',
      reservations,
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  todayArrivals(
    businessDate: string,
    requestedAt: string,
  ): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations().filter(
        (reservation) =>
          reservation.status !== 'cancelled' &&
          sameBusinessDate(reservation.arrivalDate, businessDate),
      ),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  todayDepartures(
    businessDate: string,
    requestedAt: string,
  ): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations().filter(
        (reservation) =>
          reservation.status !== 'cancelled' &&
          sameBusinessDate(reservation.departureDate, businessDate),
      ),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  roomReservationContext(
    roomId: string,
    requestedAt: string,
  ): RoomReservationContextReadModel {
    const room = this.getRoom(roomId);
    const reservations = this.listReservationsByRoomIds(new Set([roomId]));
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      roomId,
      ...(room?.roomNumber ? { roomNumber: room.roomNumber } : {}),
      ...(room?.roomType ? { roomType: room.roomType } : {}),
      reservations,
      projectionFreshness: createProjectionFreshness(
        requestedAt,
        room ? 'fresh' : 'unavailable',
      ),
    };
  }

  protected listReservations(): ReservationReadModel[] {
    const rows = sqliteRows<ReservationRow>(this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          ORDER BY r.arrival_date, r.reservation_code
        `,
      )
      .all());
    return rows.map((row) => this.reservationReadModelFromRow(row, this.now()));
  }

  protected listReservationsByRoomIds(
    roomIds: ReadonlySet<string>,
  ): ReservationReadModel[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservations().filter((reservation) => {
      if (reservation.roomId && roomIds.has(reservation.roomId)) {
        return true;
      }
      const allocation = this.getLatestReservationAllocation(
        reservation.reservationId,
      );
      return Boolean(allocation?.roomId && roomIds.has(allocation.roomId));
    });
  }
}

function normalizeReservationSearchLimit(value: number): number {
  return Number.isInteger(value) && value > 0
    ? Math.min(20, value)
    : 10;
}

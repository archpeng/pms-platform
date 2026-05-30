import {
  type GuestProfileReadModel,
  type GuestRecord,
  type GuestReservationRow,
  type ReservationReadModel,
  type ReservationSearchQuery,
  type ReservationSearchReadModel,
  type RoomReservationContextReadModel,
  type TodayReservationsReadModel,
  isBookingSource,
  isConsentMarketingState,
} from '@pms-platform/contracts';

type GuestSqlRow = {
  guest_id: string;
  display_name: string;
  phone_masked: string | null;
  email_masked: string | null;
  consent_marketing: string;
  consent_marketing_set_at: string | null;
};

type GuestReservationSqlRow = {
  reservation_code: string;
  property_id: string;
  room_number: string | null;
  room_type: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  booking_source: string | null;
};
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

  // CRM MVP v1 — raw guest profile read: guest row + their reservation list.
  // Aggregation (visitCount/firstSeen/lastStay) is intentionally NOT computed here — the
  // product-gateway join is the only layer permitted to derive that from these raw rows
  // (PMS Evidence Law + audit clarification #1 in crm-mvp-v1-2026-05-30_PLAN.md).
  getGuestProfile(
    input: { reservationCode?: string; guestId?: string },
    requestedAt: string,
  ): GuestProfileReadModel {
    let guestRow: GuestSqlRow | undefined;
    if (input.guestId) {
      guestRow = sqliteOptionalRow<GuestSqlRow>(this.db
        .prepare('SELECT * FROM guests WHERE guest_id = ?')
        .get(input.guestId));
    } else if (input.reservationCode) {
      guestRow = sqliteOptionalRow<GuestSqlRow>(this.db
        .prepare(
          `
            SELECT g.* FROM guests g
            INNER JOIN reservations r ON r.guest_id = g.guest_id
            WHERE r.reservation_code = ?
          `,
        )
        .get(input.reservationCode));
    }
    if (!guestRow) {
      return {
        schemaVersion: 'pms-guest-profile-v1',
        generatedAt: requestedAt,
        summaryStatus: 'unavailable',
        guest: undefined,
        reservations: [],
      };
    }
    const reservationRows = sqliteRows<GuestReservationSqlRow>(this.db
      .prepare(
        `
          SELECT reservation_code, property_id, room_number, room_type, arrival_date, departure_date, status, booking_source
          FROM reservations
          WHERE guest_id = ?
          ORDER BY arrival_date DESC
        `,
      )
      .all(guestRow.guest_id));
    return {
      schemaVersion: 'pms-guest-profile-v1',
      generatedAt: requestedAt,
      summaryStatus: 'fresh',
      guest: guestRecordFromRow(guestRow),
      reservations: reservationRows.map(guestReservationFromRow),
    };
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

function guestRecordFromRow(row: GuestSqlRow): GuestRecord {
  return {
    guestId: row.guest_id,
    displayName: row.display_name,
    ...(row.phone_masked ? { phoneMasked: row.phone_masked } : {}),
    ...(row.email_masked ? { emailMasked: row.email_masked } : {}),
    consentMarketing: isConsentMarketingState(row.consent_marketing) ? row.consent_marketing : 'unset',
    ...(row.consent_marketing_set_at ? { consentMarketingSetAt: row.consent_marketing_set_at } : {}),
  };
}

function guestReservationFromRow(row: GuestReservationSqlRow): GuestReservationRow {
  return {
    reservationCode: row.reservation_code,
    propertyId: row.property_id,
    ...(row.room_number ? { roomNumber: row.room_number } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    status: row.status,
    ...(row.booking_source && isBookingSource(row.booking_source) ? { bookingSource: row.booking_source } : {}),
  };
}

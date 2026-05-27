import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsReservationAdjustOperation,
  type ReservationAdjustApiRequest,
} from '../src/index.js';
import { reservationAdjustCodeFromClientToken } from '../src/sqliteSandbox/ids.js';
import {
  createSqliteLocalSandboxStore,
} from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
const vacantCleanRoom: RoomAggregate = {
  roomId: 'room-A2',
  roomNumber: 'A2',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A2',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const vacantCleanRoomB: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
};

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite local sandbox store - reservation adjust', () => {
  it('adjusts a booked reservation atomically with idempotency and availability guards', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-adjust.sqlite'),
      seedRooms: [vacantCleanRoom, vacantCleanRoomB],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-adjust-original',
        reservationCode: 'R-ADJUST-ORIGINAL',
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        guestDisplayName: 'Original Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        status: 'booked',
      },
    ]);
    const request: ReservationAdjustApiRequest = {
      operation: pmsReservationAdjustOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      clientToken: 'adjust-sqlite-1',
      requestFingerprint: 'sha256:adjust-sqlite-1',
      correlationId: 'corr-adjust-sqlite-1',
      requestedAt: '2026-04-28T00:30:00.000Z',
      reservationCode: 'R-ADJUST-ORIGINAL',
      targetRoomId: 'room-A3',
      guestDisplayName: 'Adjusted Guest',
      arrivalDate: '2026-05-06',
      departureDate: '2026-05-07',
      reason: 'guest changed room and date',
    };

    const adjusted = store.adjustReservation(request);
    const replayed = store.adjustReservation(request);
    const conflict = store.adjustReservation({ ...request, requestFingerprint: 'sha256:adjust-sqlite-1-different' });
    const readback = store.readback();

    expect(adjusted).toMatchObject({
      ok: true,
      operation: 'pms.reservation.adjust',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      originalReservation: { reservationCode: 'R-ADJUST-ORIGINAL', status: 'booked', roomId: 'room-A2' },
      reservation: {
        reservationCode: expect.stringMatching(/^RA-[A-F0-9]{16}$/),
        roomId: 'room-A3',
        roomNumber: 'A3',
        guestDisplayName: 'Adjusted Guest',
        arrivalDate: '2026-05-06',
        departureDate: '2026-05-07',
        status: 'booked',
      },
    });
    expect(replayed).toMatchObject({ ok: true, idempotencyStatus: 'replayed', reservation: adjusted.ok ? adjusted.reservation : undefined });
    expect(conflict).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_ADJUST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(readback.reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservationCode: 'R-ADJUST-ORIGINAL', status: 'cancelled' }),
      expect.objectContaining({ roomId: 'room-A3', guestDisplayName: 'Adjusted Guest', status: 'booked' }),
    ]));
    expect(readback.reservationAllocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservationId: 'res-adjust-original', status: 'released' }),
      expect.objectContaining({ roomId: 'room-A3', status: 'allocated' }),
    ]));
    store.close();
  });

  it('rejects reservation adjust for unavailable target rooms and non-booked originals', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-adjust-rejections.sqlite'),
      seedRooms: [vacantCleanRoom, vacantCleanRoomB],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-adjust-target',
        reservationCode: 'R-ADJUST-TARGET',
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        guestDisplayName: 'Target Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        status: 'booked',
      },
      {
        reservationId: 'res-adjust-blocker',
        reservationCode: 'R-ADJUST-BLOCKER',
        propertyId: 'property-small-hotel',
        roomId: 'room-A3',
        roomNumber: 'A3',
        guestDisplayName: 'Blocker Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-06',
        status: 'booked',
      },
      {
        reservationId: 'res-adjust-checked-in',
        reservationCode: 'R-ADJUST-CHECKED-IN',
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        guestDisplayName: 'Checked In Guest',
        arrivalDate: '2026-05-07',
        departureDate: '2026-05-08',
        status: 'checkedIn',
      },
    ]);

    const base = {
      operation: pmsReservationAdjustOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api' as const,
      requestFingerprint: 'sha256:adjust-reject-1',
      correlationId: 'corr-adjust-reject-1',
      requestedAt: '2026-04-28T00:30:00.000Z',
    } as const;
    const unavailable = store.adjustReservation({
      ...base,
      clientToken: 'adjust-reject-unavailable-1',
      reservationCode: 'R-ADJUST-TARGET',
      targetRoomId: 'room-A3',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
    });
    const inactive = store.adjustReservation({
      ...base,
      clientToken: 'adjust-reject-inactive-1',
      requestFingerprint: 'sha256:adjust-reject-inactive-1',
      reservationCode: 'R-ADJUST-CHECKED-IN',
      targetRoomId: 'room-A3',
      arrivalDate: '2026-05-07',
      departureDate: '2026-05-08',
    });

    expect(unavailable).toMatchObject({ ok: false, status: 'rejected', mutationStatus: 'none', errors: [{ code: 'RESERVATION_ROOM_UNAVAILABLE', field: 'targetRoomId' }] });
    expect(inactive).toMatchObject({ ok: false, status: 'rejected', mutationStatus: 'none', errors: [{ code: 'RESERVATION_ADJUST_NOT_ACTIVE', field: 'status' }] });
    expect(store.getReservation('R-ADJUST-TARGET', now)).toMatchObject({ reservationCode: 'R-ADJUST-TARGET', status: 'booked', roomId: 'room-A2' });
    store.close();
  });

  it('rolls back reservation adjust if replacement materialization fails after cancellation', () => {
    const token = 'adjust-sqlite-materialization-conflict';
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-adjust-rollback.sqlite'),
      seedRooms: [vacantCleanRoom, vacantCleanRoomB],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-adjust-rollback-original',
        reservationCode: 'R-ADJUST-ROLLBACK',
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        guestDisplayName: 'Rollback Original',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        status: 'booked',
      },
      {
        reservationId: 'res-adjust-code-conflict',
        reservationCode: reservationAdjustCodeFromClientToken(token),
        propertyId: 'property-small-hotel',
        roomId: 'room-A3',
        roomNumber: 'A3',
        guestDisplayName: 'Code Conflict',
        arrivalDate: '2026-05-10',
        departureDate: '2026-05-11',
        status: 'booked',
      },
    ]);

    expect(() => store.adjustReservation({
      operation: pmsReservationAdjustOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      clientToken: token,
      requestFingerprint: 'sha256:adjust-sqlite-materialization-conflict',
      correlationId: 'corr-adjust-sqlite-materialization-conflict',
      requestedAt: '2026-04-28T00:30:00.000Z',
      reservationCode: 'R-ADJUST-ROLLBACK',
      targetRoomId: 'room-A3',
      arrivalDate: '2026-05-06',
      departureDate: '2026-05-07',
    })).toThrow();
    expect(store.getReservation('R-ADJUST-ROLLBACK', now)).toMatchObject({ status: 'booked', roomId: 'room-A2' });
    expect(store.readback().reservationAllocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservationId: 'res-adjust-rollback-original', status: 'allocated' }),
    ]));
    store.close();
  });
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

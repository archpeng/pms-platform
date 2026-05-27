import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoomAggregate } from '@pms-platform/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsPendingActionConfirmOperation,
  pmsReservationCreateOperation,
  pmsReservationGroupPrepareBookingOperation,
  pmsReservationPrepareBookingOperation,
  type ReservationCreateApiRequest,
  type ReservationGroupPrepareBookingApiRequest,
  type ReservationPrepareBookingApiRequest,
} from '../src/index.js';
import { reservationCreateCodeFromClientToken } from '../src/sqliteSandbox/ids.js';
import { createSqliteLocalSandboxStore } from '../src/sqliteSandboxStore.js';

const now = '2026-04-28T00:00:00.000Z';
const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
const roomA1: RoomAggregate = {
  roomId: 'room-A1',
  roomNumber: 'A1',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A1',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const roomA2: RoomAggregate = { ...roomA1, roomId: 'room-A2', roomNumber: 'A2', sortKey: 'A2' };
const roomA3: RoomAggregate = { ...roomA1, roomId: 'room-A3', roomNumber: 'A3', sortKey: 'A3' };

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite local sandbox store - native reservation create', () => {
  it('commits direct create atomically with replay/conflict and inventory refs', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-create.sqlite'),
      seedRooms: [roomA1, roomA2],
      resetOnStart: true,
      now: () => now,
    });
    const request: ReservationCreateApiRequest = {
      operation: pmsReservationCreateOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'native-create-direct-1',
      requestFingerprint: 'sha256:native-create-direct-1',
      correlationId: 'corr-native-create-direct-1',
      requestedAt: now,
      roomId: 'room-A1',
      guestDisplayName: 'Direct Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
      reason: 'mobile vacant-room create',
    };

    const committed = store.createReservation(request);
    const replayed = store.createReservation(request);
    const conflict = store.createReservation({ ...request, requestFingerprint: 'sha256:native-create-direct-1-different' });
    const inventory = store.rebuildInventory({ startDate: '2026-05-04', horizonDays: 1, roomId: 'room-A1' });

    expect(committed).toMatchObject({
      ok: true,
      operation: 'pms.reservation.create',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      reservation: {
        reservationCode: expect.stringMatching(/^RC-[A-F0-9]{16}$/),
        roomId: 'room-A1',
        roomNumber: 'A1',
        guestDisplayName: 'Direct Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        status: 'booked',
      },
    });
    expect(replayed).toMatchObject({
      ok: true,
      idempotencyStatus: 'replayed',
      reservation: committed.ok && 'reservation' in committed ? committed.reservation : undefined,
    });
    expect(conflict).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_CREATE_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(inventory.dayRooms).toEqual([
      expect.objectContaining({
        businessDate: '2026-05-04',
        availabilityStatus: 'reserved',
        sourceRefs: [expect.objectContaining({ sourceType: 'reservation', sourceId: committed.ok && 'reservation' in committed ? committed.reservation.reservationId : 'missing' })],
      }),
    ]);
    store.close();
  });

  it('rejects direct create for missing rooms, invalid dates, and unavailable rooms', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-create-rejections.sqlite'),
      seedRooms: [roomA1, roomA2],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-create-blocker',
        reservationCode: 'R-CREATE-BLOCKER',
        propertyId: 'property-small-hotel',
        roomId: 'room-A1',
        roomNumber: 'A1',
        guestDisplayName: 'Blocker Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        status: 'booked',
      },
    ]);
    const base: ReservationCreateApiRequest = {
      operation: pmsReservationCreateOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'native-create-reject-1',
      requestFingerprint: 'sha256:native-create-reject-1',
      correlationId: 'corr-native-create-reject-1',
      requestedAt: now,
      roomId: 'room-A1',
      guestDisplayName: 'Rejected Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
    };

    const unavailable = store.createReservation(base);
    const missingRoom = store.createReservation({ ...base, clientToken: 'native-create-missing-room-1', requestFingerprint: 'sha256:native-create-missing-room-1', roomId: 'room-missing' });
    const invalidDates = store.createReservation({ ...base, clientToken: 'native-create-invalid-date-1', requestFingerprint: 'sha256:native-create-invalid-date-1', roomId: 'room-A2', arrivalDate: '2026-05-06', departureDate: '2026-05-06' });

    expect(unavailable).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_ROOM_UNAVAILABLE', field: 'roomId' }] });
    expect(missingRoom).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_CREATE_ROOM_NOT_FOUND', field: 'roomId' }] });
    expect(invalidDates).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_CREATE_MISSING_REQUIRED_SLOTS', field: 'departureDate' }] });
    expect(store.readback().reservations).toHaveLength(1);
    store.close();
  });

  it('rolls back direct create if reservation materialization fails', () => {
    const token = 'native-create-materialization-conflict';
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-create-rollback.sqlite'),
      seedRooms: [roomA1, roomA2],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-create-code-conflict',
        reservationCode: reservationCreateCodeFromClientToken(token),
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        guestDisplayName: 'Code Conflict',
        arrivalDate: '2026-05-10',
        departureDate: '2026-05-11',
        status: 'booked',
      },
    ]);

    expect(() => store.createReservation({
      operation: pmsReservationCreateOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: token,
      requestFingerprint: 'sha256:native-create-materialization-conflict',
      correlationId: 'corr-native-create-materialization-conflict',
      requestedAt: now,
      roomId: 'room-A1',
      guestDisplayName: 'Rollback Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
    })).toThrow();
    expect(store.readback().reservations).toEqual([
      expect.objectContaining({ reservationCode: reservationCreateCodeFromClientToken(token), roomId: 'room-A2' }),
    ]);
    store.close();
  });

  it('prepares a single-room booking pending action without creating the final reservation', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-prepare-single.sqlite'),
      seedRooms: [roomA1, roomA2],
      resetOnStart: true,
      now: () => now,
    });
    const request: ReservationPrepareBookingApiRequest = {
      operation: pmsReservationPrepareBookingOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'native-prepare-single-1',
      requestFingerprint: 'sha256:native-prepare-single-1',
      correlationId: 'corr-native-prepare-single-1',
      requestedAt: now,
      guestDisplayName: 'Prepared Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
      roomTypeKeyword: '花园',
    };

    const prepared = store.prepareReservationBooking(request);
    const replayed = store.prepareReservationBooking(request);
    const conflict = store.prepareReservationBooking({ ...request, requestFingerprint: 'sha256:native-prepare-single-1-different' });
    const readback = store.readback();

    expect(prepared).toMatchObject({
      ok: true,
      operation: 'pms.reservation.prepare_booking',
      mutationStatus: 'none',
      idempotencyStatus: 'prepared',
      draft: {
        workflowType: 'reservation',
        status: 'awaitingConfirmation',
        pendingAction: expect.objectContaining({ status: 'awaitingConfirmation', mutationStatus: 'none' }),
      },
    });
    expect(replayed).toMatchObject({ ok: true, idempotencyStatus: 'replayed', draft: prepared.ok && 'draft' in prepared ? prepared.draft : undefined });
    expect(conflict).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_CREATE_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(readback.reservations).toHaveLength(0);
    store.close();
  });

  it('prepares group booking in one PMS call and confirms atomically', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-prepare-group.sqlite'),
      seedRooms: [roomA1, roomA2, roomA3],
      resetOnStart: true,
      now: () => now,
    });
    const request: ReservationGroupPrepareBookingApiRequest = {
      operation: pmsReservationGroupPrepareBookingOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'native-prepare-group-1',
      requestFingerprint: 'sha256:native-prepare-group-1',
      correlationId: 'corr-native-prepare-group-1',
      requestedAt: now,
      guestDisplayName: 'Group Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
      roomTypeKeyword: '花园',
      quantity: 2,
    };

    const prepared = store.prepareReservationGroupBooking(request);
    const pendingAction = prepared.ok && 'groupDraft' in prepared ? prepared.groupDraft.pendingAction : undefined;
    const confirmed = store.confirmPendingAction({
      operation: pmsPendingActionConfirmOperation,
      pendingActionRef: pendingAction?.pendingActionRef ?? 'missing-pending',
      actor,
      scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-1' },
      clientToken: 'native-prepare-group-confirm-1',
      requestFingerprint: 'sha256:native-prepare-group-confirm-1',
      correlationId: 'corr-native-prepare-group-confirm-1',
      requestedAt: '2026-04-28T00:05:00.000Z',
      cardPayloadRef: pendingAction?.cardPayloadRef ?? 'missing-card',
    });
    const insufficient = store.prepareReservationGroupBooking({
      ...request,
      clientToken: 'native-prepare-group-insufficient-1',
      requestFingerprint: 'sha256:native-prepare-group-insufficient-1',
      quantity: 4,
    });

    expect(prepared).toMatchObject({
      ok: true,
      operation: 'pms.reservation.group_prepare_booking',
      mutationStatus: 'none',
      groupDraft: {
        status: 'awaitingConfirmation',
        pendingAction: expect.objectContaining({ selectionCount: 2, mutationStatus: 'none' }),
      },
    });
    expect(confirmed).toMatchObject({
      ok: true,
      operation: 'pms.pending_action.confirm',
      mutationStatus: 'committed',
      pendingAction: { workflowType: 'reservationGroup', status: 'confirmed', mutationStatus: 'committed' },
    });
    expect(store.readback().reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ guestDisplayName: 'Group Guest', roomId: 'room-A1', status: 'booked' }),
      expect.objectContaining({ guestDisplayName: 'Group Guest', roomId: 'room-A2', status: 'booked' }),
    ]));
    expect(insufficient).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_ROOM_UNAVAILABLE', field: 'quantity' }] });
    store.close();
  });
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

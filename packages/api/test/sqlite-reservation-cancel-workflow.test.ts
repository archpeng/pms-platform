import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReservationCancelPrepareOperation,
  type ReservationCancelPrepareApiRequest,
} from '../src/index.js';
import { createSqliteLocalSandboxStore } from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-cancel-1' };
const room: RoomAggregate = {
  roomId: 'room-A2',
  roomNumber: 'A2',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite reservation cancellation workflow', () => {
  it('prepares a typed cancellation card and confirms it into a formal reservation cancellation', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-cancel.sqlite'),
      seedRooms: [room],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([reservationRecord('reservation-cancel-1', 'R-CANCEL-1')]);

    const prepareRequest: ReservationCancelPrepareApiRequest = {
      operation: pmsReservationCancelPrepareOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'reservation-cancel-prepare-1',
      requestFingerprint: 'sha256:reservation-cancel-prepare-1',
      correlationId: 'corr-reservation-cancel-prepare-1',
      requestedAt: '2026-04-28T00:01:00.000Z',
      reservationCode: 'R-CANCEL-1',
      reason: 'guest changed plan',
      expiresAt: '2026-04-29T00:01:00.000Z',
    };
    const prepared = store.prepareReservationCancel(prepareRequest);
    const pendingActionRef = prepared.ok ? prepared.pendingAction.pendingActionRef : 'missing-pending';
    const cardPayloadRef = prepared.ok ? prepared.pendingAction.cardPayloadRef : 'missing-card';
    const beforeStatus = store.getPendingActionStatus({
      operation: pmsPendingActionStatusOperation,
      pendingActionRef,
      actor,
      scope,
      clientToken: 'reservation-cancel-status-1',
      requestFingerprint: 'sha256:reservation-cancel-status-1',
      correlationId: 'corr-reservation-cancel-status-1',
      requestedAt: '2026-04-28T00:02:00.000Z',
      cardPayloadRef,
    });
    const confirmRequest = {
      operation: pmsPendingActionConfirmOperation,
      pendingActionRef,
      actor,
      scope,
      clientToken: 'reservation-cancel-confirm-1',
      requestFingerprint: 'sha256:reservation-cancel-confirm-1',
      correlationId: 'corr-reservation-cancel-confirm-1',
      requestedAt: '2026-04-28T00:03:00.000Z',
      cardPayloadRef,
    } as const;
    const confirmed = store.confirmPendingAction(confirmRequest);
    const replayed = store.confirmPendingAction(confirmRequest);
    const conflict = store.confirmPendingAction({
      ...confirmRequest,
      requestFingerprint: 'sha256:reservation-cancel-confirm-different',
    });
    const afterStatus = store.getPendingActionStatus({
      operation: pmsPendingActionStatusOperation,
      pendingActionRef,
      actor,
      scope,
      clientToken: 'reservation-cancel-status-2',
      requestFingerprint: 'sha256:reservation-cancel-status-2',
      correlationId: 'corr-reservation-cancel-status-2',
      requestedAt: '2026-04-28T00:04:00.000Z',
      cardPayloadRef,
    });

    expect(prepared).toMatchObject({
      ok: true,
      operation: 'pms.reservation_cancel.prepare',
      mutationStatus: 'none',
      idempotencyStatus: 'prepared',
      pendingAction: {
        workflowType: 'reservationCancel',
        reservationCode: 'R-CANCEL-1',
        status: 'awaitingConfirmation',
        mutationStatus: 'none',
      },
      reservation: { reservationCode: 'R-CANCEL-1', status: 'booked' },
    });
    expect(beforeStatus).toMatchObject({
      ok: true,
      pendingAction: { workflowType: 'reservationCancel', status: 'awaitingConfirmation', mutationStatus: 'none' },
    });
    expect(confirmed).toMatchObject({
      ok: true,
      operation: 'pms.pending_action.confirm',
      mutationStatus: 'committed',
      pendingAction: { workflowType: 'reservationCancel', status: 'confirmed', mutationStatus: 'committed' },
      reservation: { reservationCode: 'R-CANCEL-1', status: 'cancelled' },
    });
    expect(replayed).toEqual(confirmed);
    expect(conflict).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(afterStatus).toMatchObject({
      ok: true,
      mutationStatus: 'none',
      pendingAction: { status: 'confirmed', mutationStatus: 'committed', workflowType: 'reservationCancel' },
    });

    const readback = store.readback('room-A2');
    expect(readback.reservations).toEqual([expect.objectContaining({ reservationCode: 'R-CANCEL-1', status: 'cancelled' })]);
    expect(readback.reservationAllocations).toEqual([expect.objectContaining({ reservationId: 'reservation-cancel-1', status: 'released' })]);
    expect(store.todayArrivals('2026-05-04', now).reservations).toEqual([]);
    store.close();
  });

  it('cancels the cancellation card without changing the formal reservation', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reservation-cancel-card-cancel.sqlite'),
      seedRooms: [room],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([reservationRecord('reservation-card-cancel-1', 'R-CARD-CANCEL-1')]);
    const prepared = store.prepareReservationCancel({
      operation: pmsReservationCancelPrepareOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'reservation-cancel-card-prepare-1',
      requestFingerprint: 'sha256:reservation-cancel-card-prepare-1',
      correlationId: 'corr-reservation-cancel-card-prepare-1',
      requestedAt: '2026-04-28T00:01:00.000Z',
      reservationCode: 'R-CARD-CANCEL-1',
      reason: 'duplicate request',
    });
    const cancelled = store.cancelPendingAction({
      operation: pmsPendingActionCancelOperation,
      pendingActionRef: prepared.ok ? prepared.pendingAction.pendingActionRef : 'missing-pending',
      actor,
      scope,
      clientToken: 'reservation-cancel-card-cancel-1',
      requestFingerprint: 'sha256:reservation-cancel-card-cancel-1',
      correlationId: 'corr-reservation-cancel-card-cancel-1',
      requestedAt: '2026-04-28T00:02:00.000Z',
      cardPayloadRef: prepared.ok ? prepared.pendingAction.cardPayloadRef : 'missing-card',
      reason: 'operator cancelled cancellation request',
    });

    expect(cancelled).toMatchObject({
      ok: true,
      mutationStatus: 'none',
      pendingAction: { workflowType: 'reservationCancel', status: 'cancelled', mutationStatus: 'none' },
    });
    expect(store.getReservation('R-CARD-CANCEL-1', now)).toMatchObject({ status: 'booked' });
    store.close();
  });
});

function reservationRecord(reservationId: string, reservationCode: string) {
  return {
    reservationId,
    reservationCode,
    propertyId: 'property-small-hotel',
    roomId: 'room-A2',
    roomNumber: 'A2',
    roomTypeId: 'room-type-garden-villa',
    roomType: '花园别墅',
    guestDisplayName: 'Cancel Guest',
    arrivalDate: '2026-05-04',
    departureDate: '2026-05-05',
    status: 'booked' as const,
    allocation: {
      allocationId: `alloc-${reservationId}`,
      roomId: 'room-A2',
      roomNumber: 'A2',
      roomTypeId: 'room-type-garden-villa',
      roomType: '花园别墅',
      startDate: '2026-05-04',
      endDate: '2026-05-05',
      status: 'allocated',
    },
  };
}

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-cancel-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

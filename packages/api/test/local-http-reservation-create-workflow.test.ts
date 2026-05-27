import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoomAggregate } from '@pms-platform/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsReservationCreateOperation,
  pmsReservationGroupPrepareBookingOperation,
  pmsReservationPrepareBookingOperation,
} from '../src/index.js';
import {
  startPmsLocalHttpServer,
  type StartedPmsLocalHttpServer,
} from '../src/localSandbox.js';
import { createSqliteLocalSandboxStore } from '../src/sqliteSandboxStore.js';

const authToken = 'test-local-auth-token';
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

const tmpRoots: string[] = [];
const servers: StartedPmsLocalHttpServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('PMS local durable sandbox HTTP boundary - native reservation create', () => {
  it('serves direct create and native prepare booking routes', async () => {
    const { url } = await startServer();
    const directCreate = await authedPost(`${url}/v1/pms/reservations/create`, {
      operation: pmsReservationCreateOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'http-native-create-1',
      requestFingerprint: 'sha256:http-native-create-1',
      correlationId: 'corr-http-native-create-1',
      requestedAt: '2026-05-02T00:00:00.000Z',
      roomId: 'room-A1',
      guestDisplayName: 'HTTP Direct Guest',
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-05',
    });
    const singlePrepare = await authedPost(`${url}/v1/pms/reservations/prepare-booking`, {
      operation: pmsReservationPrepareBookingOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'http-native-single-prepare-1',
      requestFingerprint: 'sha256:http-native-single-prepare-1',
      correlationId: 'corr-http-native-single-prepare-1',
      requestedAt: '2026-05-02T00:01:00.000Z',
      guestDisplayName: 'HTTP Prepared Guest',
      arrivalDate: '2026-05-06',
      departureDate: '2026-05-07',
      roomTypeKeyword: '花园',
    });
    const groupPrepare = await authedPost(`${url}/v1/pms/reservation-groups/prepare-booking`, {
      operation: pmsReservationGroupPrepareBookingOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'http-native-group-prepare-1',
      requestFingerprint: 'sha256:http-native-group-prepare-1',
      correlationId: 'corr-http-native-group-prepare-1',
      requestedAt: '2026-05-02T00:02:00.000Z',
      guestDisplayName: 'HTTP Group Guest',
      arrivalDate: '2026-05-08',
      departureDate: '2026-05-09',
      roomTypeKeyword: '花园',
      quantity: 2,
    });

    expect(directCreate).toMatchObject({
      ok: true,
      operation: 'pms.reservation.create',
      mutationStatus: 'committed',
      reservation: { roomId: 'room-A1', guestDisplayName: 'HTTP Direct Guest', status: 'booked' },
    });
    expect(singlePrepare).toMatchObject({
      ok: true,
      operation: 'pms.reservation.prepare_booking',
      mutationStatus: 'none',
      draft: { status: 'awaitingConfirmation', pendingAction: { mutationStatus: 'none' } },
    });
    expect(groupPrepare).toMatchObject({
      ok: true,
      operation: 'pms.reservation.group_prepare_booking',
      mutationStatus: 'none',
      groupDraft: { status: 'awaitingConfirmation', pendingAction: { selectionCount: 2 } },
    });
  });
});

async function startServer() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'pms-sandbox-'));
  tmpRoots.push(tmpRoot);
  const store = createSqliteLocalSandboxStore({
    dbPath: join(tmpRoot, 'pms.sqlite'),
    seedRooms: [roomA1, roomA2],
    resetOnStart: true,
  });
  const started = await startPmsLocalHttpServer({
    store,
    auth: { token: authToken, required: true },
  });
  servers.push(started);
  return started;
}

async function authedPost(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json();
}

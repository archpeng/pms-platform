import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoomAggregate } from '@pms-platform/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsGuestIdCardArchiveOperation,
  pmsGuestIdCardConfirmOperation,
  pmsGuestIdCardPrepareOperation,
  pmsReservationCreateOperation,
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

const RAW_ID_NUMBER = '110101199003071234';
const ID_NUMBER_HASH = 'sha256:fake-id-number-hash';

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

describe('PMS local durable sandbox HTTP boundary - guest ID-card archive', () => {
  it('archives an ID card against a reservation guest and replays idempotently without echoing the raw number', async () => {
    const { url } = await startServer();
    const reservationCode = await createReservation(url);

    const archive = await postJson(`${url}/v1/pms/guests/id-card/archive`, archiveBody(reservationCode, 'guest-id-card-1'));
    expect(archive.status).toBe(200);
    expect(archive.body).toMatchObject({
      ok: true,
      operation: pmsGuestIdCardArchiveOperation,
      status: 'ok',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      idCard: {
        reservationCode,
        displayName: 'HTTP Direct Guest',
        documentType: 'national_id',
        idNumberHash: ID_NUMBER_HASH,
        status: 'archived',
      },
    });
    // Red line: the archive fact must never carry the raw ID number — only the hash.
    expect(JSON.stringify(archive.body)).not.toContain(RAW_ID_NUMBER);
    expect((archive.body as { idCard: { guestId: string } }).idCard.guestId).toBeTruthy();

    // Same client token + fingerprint replays the stored fact (no second write).
    const replay = await postJson(`${url}/v1/pms/guests/id-card/archive`, archiveBody(reservationCode, 'guest-id-card-1'));
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, idempotencyStatus: 'replayed' });
  });

  it('rejects an unknown reservation reference with notFound', async () => {
    const { url } = await startServer();
    const archive = await postJson(`${url}/v1/pms/guests/id-card/archive`, archiveBody('R-DOES-NOT-EXIST', 'guest-id-card-missing'));
    expect(archive.status).toBe(404);
    expect(archive.body).toMatchObject({
      ok: false,
      status: 'notFound',
      errors: [{ code: 'GUEST_ID_CARD_RESERVATION_NOT_FOUND' }],
    });
  });

  it('rejects a missing ID number with a field-scoped error', async () => {
    const { url } = await startServer();
    const reservationCode = await createReservation(url);
    const body = { ...archiveBody(reservationCode, 'guest-id-card-incomplete'), idNumber: '' };
    const archive = await postJson(`${url}/v1/pms/guests/id-card/archive`, body);
    expect(archive.status).toBe(400);
    expect(archive.body).toMatchObject({
      ok: false,
      status: 'rejected',
      errors: [{ code: 'GUEST_ID_CARD_MISSING_REQUIRED_FIELDS', field: 'idNumber' }],
    });
  });

  it('prepares a server-side draft (no raw number in the response) and confirms it into the archive', async () => {
    const { url } = await startServer();
    const reservationCode = await createReservation(url);

    const prepare = await postJson(`${url}/v1/pms/guests/id-card/prepare`, {
      operation: pmsGuestIdCardPrepareOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'guest-id-card-prepare-1',
      requestFingerprint: 'sha256:guest-id-card-prepare-1',
      correlationId: 'corr-guest-id-card-prepare-1',
      requestedAt: '2026-05-02T00:06:00.000Z',
      reservationRef: reservationCode,
      name: '李晶晶',
      idNumber: RAW_ID_NUMBER,
    });
    expect(prepare.status).toBe(200);
    expect(prepare.body).toMatchObject({
      ok: true,
      operation: pmsGuestIdCardPrepareOperation,
      mutationStatus: 'none',
      preparation: { reservationCode, status: 'awaitingConfirmation', maskedIdNumber: '1101**********1234' },
    });
    // Red line: the prepare response must carry NO raw ID number — only the hash + masked echo.
    expect(JSON.stringify(prepare.body)).not.toContain(RAW_ID_NUMBER);
    const preparation = (prepare.body as { preparation: { pendingActionRef: string; cardPayloadRef: string } }).preparation;

    const confirm = await postJson(`${url}/v1/pms/guests/id-card/confirm`, {
      operation: pmsGuestIdCardConfirmOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'guest-id-card-confirm-1',
      requestFingerprint: 'sha256:guest-id-card-confirm-1',
      correlationId: 'corr-guest-id-card-confirm-1',
      requestedAt: '2026-05-02T00:07:00.000Z',
      pendingActionRef: preparation.pendingActionRef,
      cardPayloadRef: preparation.cardPayloadRef,
    });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({
      ok: true,
      operation: pmsGuestIdCardConfirmOperation,
      mutationStatus: 'committed',
      idCard: { reservationCode, status: 'archived' },
    });
    expect(JSON.stringify(confirm.body)).not.toContain(RAW_ID_NUMBER);

    // A second confirm with the same refs replays; a mismatched payload ref is rejected.
    const mismatch = await postJson(`${url}/v1/pms/guests/id-card/confirm`, {
      operation: pmsGuestIdCardConfirmOperation,
      propertyId: 'property-small-hotel',
      actor,
      source: 'api',
      clientToken: 'guest-id-card-confirm-mismatch',
      requestFingerprint: 'sha256:guest-id-card-confirm-mismatch',
      correlationId: 'corr-guest-id-card-confirm-mismatch',
      requestedAt: '2026-05-02T00:08:00.000Z',
      pendingActionRef: preparation.pendingActionRef,
      cardPayloadRef: 'sha256:not-the-card',
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toMatchObject({ ok: false, errors: [{ code: 'GUEST_ID_CARD_CARD_PAYLOAD_MISMATCH' }] });
  });
});

function archiveBody(reservationRef: string, clientToken: string) {
  return {
    operation: pmsGuestIdCardArchiveOperation,
    propertyId: 'property-small-hotel',
    actor,
    source: 'api',
    clientToken,
    requestFingerprint: `sha256:${clientToken}`,
    correlationId: `corr-${clientToken}`,
    requestedAt: '2026-05-02T00:05:00.000Z',
    reservationRef,
    name: '李晶晶',
    idNumber: RAW_ID_NUMBER,
    idNumberHash: ID_NUMBER_HASH,
  };
}

async function createReservation(url: string): Promise<string> {
  const created = await postJson(`${url}/v1/pms/reservations/create`, {
    operation: pmsReservationCreateOperation,
    propertyId: 'property-small-hotel',
    actor,
    source: 'api',
    clientToken: 'http-create-for-id-card-1',
    requestFingerprint: 'sha256:http-create-for-id-card-1',
    correlationId: 'corr-http-create-for-id-card-1',
    requestedAt: '2026-05-02T00:00:00.000Z',
    roomId: 'room-A1',
    guestDisplayName: 'HTTP Direct Guest',
    arrivalDate: '2026-05-04',
    departureDate: '2026-05-05',
  });
  expect(created.status).toBe(200);
  return (created.body as { reservation: { reservationCode: string } }).reservation.reservationCode;
}

async function startServer() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'pms-sandbox-'));
  tmpRoots.push(tmpRoot);
  const store = createSqliteLocalSandboxStore({
    dbPath: join(tmpRoot, 'pms.sqlite'),
    seedRooms: [roomA1],
    resetOnStart: true,
  });
  const started = await startPmsLocalHttpServer({
    store,
    auth: { token: authToken, required: true },
  });
  servers.push(started);
  return started;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

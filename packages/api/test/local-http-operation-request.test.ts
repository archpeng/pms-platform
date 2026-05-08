import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsAvailabilitySearchOperation,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsReportMaintenanceOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type PmsExtendedCommandApiRequest,
} from '../src/index.js';
import {
  pmsLocalAuthTokenEnvName,
  startPmsLocalHttpServer,
  type PmsSandboxReservationImportRecord,
  type StartedPmsLocalHttpServer,
} from '../src/localSandbox.js';
import { createSqliteLocalSandboxStore, pmsSqliteDbPathEnvName } from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const authToken = 'test-local-auth-token';
const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A1',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
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
const vacantDirtyRoom: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
  cleaningStatus: 'dirty',
};

const dryRunRequest: CheckOutDryRunApiRequest = {
  operation: pmsCheckOutOperation,
  mode: 'dryRun',
  roomId: 'room-1001',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest departed and returned room cards.',
  idempotencyKey: 'live-sandbox-dry-run-room-1001',
  correlationId: 'corr-live-sandbox-room-1001',
  requestedAt: '2026-04-26T00:00:00.000Z',
  requestFingerprint: 'sha256:live-sandbox-dry-run-room-1001',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'live-sandbox-confirm-room-1001',
  requestFingerprint: 'sha256:live-sandbox-confirm-room-1001',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'confirm',
  roomId: 'room-A2',
  reservationId: 'res-A2-http',
  reservationCode: 'R-A2-HTTP',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest arrived with verified reservation.',
  idempotencyKey: 'live-sandbox-checkin-room-A2',
  correlationId: 'corr-live-sandbox-checkin-room-A2',
  requestedAt: '2026-04-26T15:00:00.000Z',
  requestFingerprint: 'sha256:live-sandbox-checkin-room-A2',
};

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

describe('PMS local durable checkout sandbox HTTP boundary - local-http-operation-request', () => {
  it('creates, reads, and updates operation requests through HTTP without mutating PMS state', async () => {
      const { url } = await startServer();
  
      const before = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
      const createBody = {
        propertyId: 'property-small-hotel',
        clientToken: 'http-form-checkout-room-1001',
        requestFingerprint: 'sha256:http-form-checkout-room-1001',
        source: 'external_form',
        action: 'CHECK_OUT',
        roomId: 'room-1001',
        roomNumber: '1001',
        payload: { action: 'CHECK_OUT', roomNumber: '1001' },
        requestedAt: '2026-04-26T00:00:00.000Z',
      };
  
      const created = await authedPost(`${url}/v1/pms/operation-requests/create`, createBody);
      const duplicate = await authedPost(`${url}/v1/pms/operation-requests/create`, createBody);
      const mismatch = await authedPost(`${url}/v1/pms/operation-requests/create`, {
        ...createBody,
        requestFingerprint: 'sha256:http-form-checkout-room-1001-different',
      });
      const updated = await authedPost(`${url}/v1/pms/operation-requests/update`, {
        clientToken: 'http-form-checkout-room-1001',
        status: 'awaitingConfirmation',
        result: { dryRun: 'ready' },
        updatedAt: '2026-04-26T00:01:00.000Z',
      });
      const fetched = await authedPost(`${url}/v1/pms/operation-requests/get`, {
        clientToken: 'http-form-checkout-room-1001',
      });
      const listed = await authedPost(`${url}/v1/pms/operation-requests/list`, {
        status: 'awaitingConfirmation',
        roomId: 'room-1001',
        limit: 3,
        requestedAt: '2026-04-26T00:02:00.000Z',
      });
      const genericDispatch = await authedPost(`${url}/v1/pms/operation-requests/execute`, {
        operation: 'pms_operation_request_update',
        clientToken: 'http-form-checkout-room-1001',
        status: 'confirmed',
        updatedAt: '2026-04-26T00:03:00.000Z',
      });
      const after = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
  
      expect(created).toMatchObject({
        ok: true,
        operation: 'pms_operation_request_create',
        idempotencyStatus: 'created',
        request: { clientToken: 'http-form-checkout-room-1001', status: 'queued' },
      });
      expect(duplicate).toMatchObject({ ok: true, idempotencyStatus: 'replayed' });
      expect(mismatch).toMatchObject({ ok: false, errors: [{ code: 'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(updated).toMatchObject({ ok: true, request: { status: 'awaitingConfirmation', resultJson: '{"dryRun":"ready"}' } });
      expect(fetched).toMatchObject({ ok: true, operation: 'pms_operation_request_get', request: { status: 'awaitingConfirmation' } });
      expect(listed).toMatchObject({
        ok: true,
        operation: 'pms_operation_request_list',
        count: 1,
        truncated: false,
        updatedAt: '2026-04-26T00:02:00.000Z',
        filter: { status: 'awaitingConfirmation', roomId: 'room-1001', limit: 3 },
        requests: [{ clientToken: 'http-form-checkout-room-1001', status: 'awaitingConfirmation', roomId: 'room-1001' }],
      });
      expect(genericDispatch).toMatchObject({ ok: false, error: { code: 'PMS_LOCAL_ROUTE_NOT_FOUND' } });
      expect(after.operationRequests).toEqual([
        expect.objectContaining({ clientToken: 'http-form-checkout-room-1001', status: 'awaitingConfirmation' }),
      ]);
      expect(after.rooms).toEqual(before.rooms);
      expect(after.housekeepingTasks).toEqual([]);
      expect(after.maintenanceTickets).toEqual([]);
      expect(after.audits).toEqual([]);
      expect(after.domainEvents).toEqual([]);
    });
  
    
});

async function startServer(
  existingPath?: string,
  resetOnStart = true,
  seedRooms: readonly RoomAggregate[] = [dueOutRoom],
  seedReservations: readonly PmsSandboxReservationImportRecord[] = [],
) {
  const tmpRoot = existingPath ? undefined : mkdtempSync(join(tmpdir(), 'pms-sandbox-'));
  if (tmpRoot) {
    tmpRoots.push(tmpRoot);
  }
  const dbPath = existingPath ?? join(tmpRoot!, 'pms.sqlite');
  const store = createSqliteLocalSandboxStore({
    dbPath,
    seedRooms,
    seedReservations,
    resetOnStart,
  });
  const started = await startPmsLocalHttpServer({
    store,
    auth: {
      token: authToken,
      required: true,
    },
  });
  servers.push(started);
  return { ...started, dbPath };
}

async function closeAllServers() {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
}

async function getJson(url: string) {
  const response = await fetch(url);
  return response.json();
}

async function authedGet(url: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(response.status).toBe(200);
  return response.json();
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
  return response.json();
}

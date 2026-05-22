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
  pmsReservationSearchOperation,
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

describe('PMS local durable checkout sandbox HTTP boundary - local-http-readmodel', () => {
  it('imports reservations and exposes arrivals plus room reservation context through HTTP', async () => {
      const { url } = await startServer();
  
      const imported = await authedPost(`${url}/v1/sandbox/reservations/import`, {
        reservations: [
          {
            reservationId: 'res-http-1',
            reservationCode: 'R-HTTP-1',
            propertyId: 'property-small-hotel',
            roomId: 'room-1001',
            roomNumber: '1001',
            roomTypeId: 'room-type-garden-villa',
            roomType: '花园别墅',
            guestDisplayName: 'Guest Http',
            arrivalDate: '2026-04-26',
            departureDate: '2026-04-27',
            status: 'booked',
            allocation: { allocationId: 'alloc-http-1', status: 'allocated' },
          },
        ],
      });
      expect(imported).toMatchObject({
        ok: true,
        operation: 'sandbox_reservations_import',
        result: { importedCount: 1 },
      });
  
      const arrivals = await authedPost(`${url}/v1/pms/reservations/today-arrivals`, {
        businessDate: '2026-04-26',
        requestedAt: '2026-04-26T08:00:00.000Z',
      });
      expect(arrivals).toMatchObject({
        ok: true,
        operation: 'pms_today_arrivals',
        readModel: {
          reservations: [{ reservationCode: 'R-HTTP-1', roomNumber: '1001', guestDisplayName: 'Guest Http' }],
        },
      });

      const reservationSearch = await authedPost(`${url}/v1/pms/reservations/search`, {
        operation: pmsReservationSearchOperation,
        guestDisplayName: 'Http',
        limit: 99,
        requestedAt: '2026-04-26T08:00:00.000Z',
      });
      expect(reservationSearch).toMatchObject({
        ok: true,
        operation: 'pms_reservation_search',
        readModel: {
          query: { guestDisplayName: 'Http', limit: 20 },
          reservations: [{ reservationCode: 'R-HTTP-1', roomNumber: '1001', guestDisplayName: 'Guest Http' }],
        },
      });
      const shortSearch = await authedPost(`${url}/v1/pms/reservations/search`, {
        operation: pmsReservationSearchOperation,
        guestDisplayName: 'H',
      });
      expect(shortSearch).toMatchObject({
        ok: false,
        operation: 'pms_reservation_search',
        error: { code: 'invalid_reservation_search_request' },
      });
  
      const roomContext = await authedPost(`${url}/v1/pms/room/reservation-context`, {
        roomId: 'room-1001',
        requestedAt: '2026-04-26T08:00:00.000Z',
      });
      expect(roomContext).toMatchObject({
        ok: true,
        operation: 'pms_room_reservation_context',
        readModel: {
          roomId: 'room-1001',
          reservations: [{ reservationCode: 'R-HTTP-1' }],
        },
      });
  
      const inventoryIntervals = await authedPost(`${url}/v1/pms/inventory/intervals`, {
        roomId: 'room-1001',
        startDate: '2026-04-26',
        horizonDays: 1,
      });
      expect(inventoryIntervals).toMatchObject({
        ok: true,
        operation: 'pms_inventory_intervals',
        readModel: {
          intervals: [{ roomId: 'room-1001', calendarKind: 'reserved', startDate: '2026-04-26', endDate: '2026-04-27' }],
        },
      });
  
      const inventorySummary = await authedPost(`${url}/v1/pms/inventory/summary`, {
        startDate: '2026-04-26',
        horizonDays: 1,
      });
      expect(inventorySummary).toMatchObject({
        ok: true,
        operation: 'pms_inventory_summary',
        readModel: {
          summaries: [{ businessDate: '2026-04-26', totalRooms: 1, reservedRooms: 1 }],
        },
      });
  
      const availability = await authedPost(`${url}/v1/pms/availability/search`, {
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-04-27',
        roomTypeKeyword: '花园',
        requestedAt: '2026-04-26T08:00:00.000Z',
      });
      expect(availability).toMatchObject({
        ok: true,
        operation: 'pms_availability_search',
        readModel: {
          request: { startDate: '2026-04-27', endDate: '2026-04-28', roomTypeKeyword: '花园', unsupportedFilters: [] },
          candidates: [{ roomId: 'room-1001', roomNumber: '1001', roomType: '花园别墅', availableDates: ['2026-04-27'] }],
        },
      });
  
      const capacityGap = await authedPost(`${url}/v1/pms/availability/search`, {
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-04-27',
        capacity: 3,
        requestedAt: '2026-04-26T08:00:00.000Z',
      });
      expect(capacityGap).toMatchObject({
        ok: true,
        operation: 'pms_availability_search',
        readModel: {
          request: { unsupportedFilters: ['capacity'] },
          candidates: [],
        },
      });
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

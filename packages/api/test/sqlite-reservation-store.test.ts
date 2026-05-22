import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsMaintenanceDoneOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsRestoreSellableOperation,
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type MaintenanceDoneApiRequest,
  type OperationRequestCreateApiRequest,
  type ReportMaintenanceApiRequest,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
  type RestoreSellableApiRequest,
} from '../src/index.js';
import {
  createSqliteLocalSandboxStore,
  pmsSqliteDbPathEnvName,
} from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
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
const vacantCleanRoomB: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
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
  idempotencyKey: 'sqlite-dry-run-room-1001',
  correlationId: 'corr-sqlite-room-1001',
  requestedAt: '2026-04-28T00:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-dry-run-room-1001',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-confirm-room-1001',
  requestFingerprint: 'sha256:sqlite-confirm-room-1001',
};

const checkInDryRunRequest: CheckInDryRunApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'dryRun',
  roomId: 'room-A2',
  reservationId: 'res-A2-checkin',
  reservationCode: 'R-A2-CHECKIN',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest arrived with verified reservation.',
  idempotencyKey: 'sqlite-checkin-dry-run-room-A2',
  correlationId: 'corr-sqlite-checkin-room-A2',
  requestedAt: '2026-04-28T15:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-checkin-dry-run-room-A2',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  ...checkInDryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-checkin-confirm-room-A2',
  requestFingerprint: 'sha256:sqlite-checkin-confirm-room-A2',
};

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite local sandbox store - sqlite-reservation-store', () => {
  it('imports reservations with allocation and stay context into canonical SQLite tables', () => {
      const store = createSqliteLocalSandboxStore({
        dbPath: tempPath('reservations.sqlite'),
        seedRooms: [vacantCleanRoom],
        resetOnStart: true,
        now: () => now,
      });
  
      const imported = store.importReservations([
        {
          reservationId: 'res-A2-1',
          reservationCode: 'R-A2-1',
          propertyId: 'property-small-hotel',
          roomId: 'room-A2',
          roomNumber: 'A2',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          guestDisplayName: 'Guest A',
          arrivalDate: '2026-04-28',
          departureDate: '2026-04-29',
          status: 'booked',
          allocation: {
            allocationId: 'alloc-A2-1',
            status: 'allocated',
          },
          stay: {
            stayId: 'stay-A2-1',
            checkedInAt: '2026-04-28T15:00:00.000Z',
            status: 'inHouse',
          },
        },
      ]);
  
      expect(imported.importedCount).toBe(1);
      expect(imported.reservations).toMatchObject([
        {
          reservationId: 'res-A2-1',
          reservationCode: 'R-A2-1',
          roomId: 'room-A2',
          roomNumber: 'A2',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          guestDisplayName: 'Guest A',
          status: 'checkedIn',
        },
      ]);
  
      const readback = store.readback('room-A2');
      expect(readback.reservations).toHaveLength(1);
      expect(readback.reservationAllocations).toMatchObject([
        {
          allocationId: 'alloc-A2-1',
          reservationId: 'res-A2-1',
          roomId: 'room-A2',
        },
      ]);
      expect(readback.stays).toMatchObject([
        {
          stayId: 'stay-A2-1',
          reservationId: 'res-A2-1',
          reservationCode: 'R-A2-1',
          roomId: 'room-A2',
          status: 'inHouse',
        },
      ]);
      expect(store.todayArrivals('2026-04-28', now).reservations).toHaveLength(1);
      expect(store.roomReservationContext('room-A2', now).reservations[0]).toMatchObject({
        reservationCode: 'R-A2-1',
        status: 'checkedIn',
      });
      expect(store.searchReservations({ guestDisplayName: 'Guest', limit: 10 }, now)).toMatchObject({
        schemaVersion: 'pms-dashboard-mvp-v1',
        summaryStatus: 'fresh',
        query: { guestDisplayName: 'Guest', limit: 10 },
        reservations: [{ reservationCode: 'R-A2-1', status: 'checkedIn' }],
      });
      expect(store.searchReservations({ guestDisplayName: 'Guest', status: 'checkedIn', limit: 10 }, now).reservations).toMatchObject([
        { reservationCode: 'R-A2-1', status: 'checkedIn' },
      ]);
      expect(store.searchReservations({ guestDisplayName: 'Missing', status: 'booked', limit: 10 }, now).reservations).toEqual([]);
      store.close();
    });
  
    
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

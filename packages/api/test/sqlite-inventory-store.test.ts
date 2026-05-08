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

describe('SQLite local sandbox store - sqlite-inventory-store', () => {
  it('derives inventory reservations, stays, intervals, and day/type summaries from SQLite state', () => {
      const store = createSqliteLocalSandboxStore({
        dbPath: tempPath('inventory-reservations.sqlite'),
        seedRooms: [vacantCleanRoom, vacantCleanRoomB],
        resetOnStart: true,
        now: () => now,
      });
  
      store.importReservations([
        {
          reservationId: 'res-A2-reserved',
          reservationCode: 'R-A2-RESERVED',
          propertyId: 'property-small-hotel',
          roomId: 'room-A2',
          roomNumber: 'A2',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          guestDisplayName: 'Guest Reserved',
          arrivalDate: '2026-04-28',
          departureDate: '2026-04-29',
          status: 'booked',
          allocation: { allocationId: 'alloc-A2-reserved', status: 'allocated' },
        },
        {
          reservationId: 'res-A3-occupied',
          reservationCode: 'R-A3-OCCUPIED',
          propertyId: 'property-small-hotel',
          roomId: 'room-A3',
          roomNumber: 'A3',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          guestDisplayName: 'Guest Occupied',
          arrivalDate: '2026-04-28',
          departureDate: '2026-04-30',
          status: 'checkedIn',
          allocation: { allocationId: 'alloc-A3-occupied', status: 'allocated' },
          stay: { stayId: 'stay-A3-occupied', checkedInAt: '2026-04-28T15:00:00.000Z', status: 'inHouse' },
        },
      ]);
  
      const inventory = store.inventoryIntervals({ startDate: '2026-04-28', horizonDays: 1 });
      expect(inventory.dayRooms).toMatchObject([
        { businessDate: '2026-04-28', roomId: 'room-A2', availabilityStatus: 'reserved' },
        { businessDate: '2026-04-28', roomId: 'room-A3', availabilityStatus: 'occupied' },
      ]);
      expect(inventory.intervals).toEqual(expect.arrayContaining([
        expect.objectContaining({ roomId: 'room-A2', calendarKind: 'reserved', startDate: '2026-04-28', endDate: '2026-04-29' }),
        expect.objectContaining({ roomId: 'room-A3', calendarKind: 'occupied', startDate: '2026-04-28', endDate: '2026-04-29' }),
      ]));
      expect(inventory.summaries).toMatchObject([
        {
          businessDate: '2026-04-28',
          roomTypeId: 'room-type-garden-villa',
          totalRooms: 2,
          availableRooms: 0,
          occupiedRooms: 1,
          blockedRooms: 0,
          reservedRooms: 1,
        },
      ]);
      expect(store.readback().inventorySummaryDayType[0]).toMatchObject({ reservedRooms: 1, occupiedRooms: 1 });
      store.close();
    });
  
    
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

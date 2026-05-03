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

describe('SQLite local sandbox store', () => {
  it('initializes an idempotent schema and reports sqlite storage metadata', () => {
    const dbPath = tempPath('pms.sqlite');

    const store = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });
    expect(store.storage).toEqual({
      kind: 'sqlite',
      envName: pmsSqliteDbPathEnvName,
      driver: 'node:sqlite',
      experimental: true,
    });
    expect(store.readback().storage).toEqual(store.storage);
    expect(store.readback().properties).toMatchObject([
      {
        propertyId: 'property-small-hotel',
        propertyCode: 'small-hotel',
        timezone: 'Asia/Shanghai',
      },
    ]);
    expect(store.readback().roomTypes).toMatchObject([
      {
        roomTypeId: 'room-type-garden-villa',
        propertyId: 'property-small-hotel',
        displayName: '花园别墅',
      },
    ]);
    expect(store.readback().rooms).toEqual([dueOutRoom]);
    store.close();

    const reopened = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [],
      resetOnStart: false,
      now: () => now,
    });
    expect(reopened.readback().rooms).toEqual([dueOutRoom]);
    reopened.close();
  });

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
    store.close();
  });

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

  it('keeps dry-run non-mutating while recording API idempotency', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('dry-run.sqlite'),
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });

    const beforeInventory = store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 });
    const dryRun = store.runInTransaction(() =>
      executeCheckOutApiRequest(dryRunRequest, store.ports, {
        idempotency: store.apiIdempotency,
      }),
    );

    expect(dryRun).toMatchObject({ ok: true, operation: 'pms_check_out', mode: 'dryRun' });
    const readback = store.readback('room-1001');
    expect(store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 })).toEqual(beforeInventory);
    expect(readback.rooms).toEqual([dueOutRoom]);
    expect(readback.housekeepingTasks).toEqual([]);
    expect(readback.audits).toEqual([]);
    expect(readback.domainEvents).toEqual([]);
    expect(readback.idempotencyRecords).toContainEqual({
      operation: 'pms_check_out',
      mode: 'dryRun',
      idempotencyKey: dryRunRequest.idempotencyKey,
      requestFingerprint: dryRunRequest.requestFingerprint,
      ok: true,
    });
    expect(readback.projectionOutbox).toEqual([
      expect.objectContaining({
        owner: 'pms-platform',
        deliveryOwner: 'adapter',
        truthOwner: 'pms-platform',
        sourceType: 'apiIdempotency',
        projectionKind: 'dryRunReadback',
        status: 'skipped',
        attemptCount: 0,
      }),
    ]);
    expect(JSON.stringify(readback.projectionOutbox)).not.toContain(dryRunRequest.idempotencyKey);
    store.close();
  });

  it('creates, replays, and closes PMS-owned stays only after successful check-in and checkout confirms', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('stay-lifecycle.sqlite'),
      seedRooms: [vacantCleanRoom],
      resetOnStart: true,
      now: () => now,
    });
    store.importReservations([
      {
        reservationId: 'res-A2-checkin',
        reservationCode: 'R-A2-CHECKIN',
        propertyId: 'property-small-hotel',
        roomId: 'room-A2',
        roomNumber: 'A2',
        roomTypeId: 'room-type-garden-villa',
        roomType: '花园别墅',
        guestDisplayName: 'Guest Checkin',
        arrivalDate: '2026-04-28',
        departureDate: '2026-04-29',
        status: 'booked',
        allocation: { allocationId: 'alloc-A2-checkin', status: 'allocated' },
      },
    ]);
    expect(store.readback('room-A2').stays).toEqual([]);

    const dryRun = store.runInTransaction(() =>
      executeCheckInApiRequest(checkInDryRunRequest, store.ports, {
        idempotency: store.apiIdempotency,
        stayLifecycle: {
          afterCheckInConfirm: ({ request, result }) => store.recordCheckInStay(request, result),
        },
      }),
    );
    expect(dryRun).toMatchObject({ ok: true, operation: 'pms_check_in', mode: 'dryRun' });
    expect(store.readback('room-A2').stays).toEqual([]);

    const checkIn = store.runInTransaction(() =>
      executeCheckInApiRequest(checkInConfirmRequest, store.ports, {
        idempotency: store.apiIdempotency,
        stayLifecycle: {
          afterCheckInConfirm: ({ request, result }) => store.recordCheckInStay(request, result),
        },
      }),
    );
    const checkInReplay = store.runInTransaction(() =>
      executeCheckInApiRequest(checkInConfirmRequest, store.ports, {
        idempotency: store.apiIdempotency,
        stayLifecycle: {
          afterCheckInConfirm: ({ request, result }) => store.recordCheckInStay(request, result),
        },
      }),
    );
    expect(checkInReplay).toEqual(checkIn);
    expect(store.readback('room-A2').stays).toMatchObject([
      {
        reservationId: 'res-A2-checkin',
        reservationCode: 'R-A2-CHECKIN',
        roomId: 'room-A2',
        roomNumber: 'A2',
        checkedInAt: '2026-04-28T15:00:00.000Z',
        status: 'inHouse',
      },
    ]);
    expect(store.getReservation('R-A2-CHECKIN', now)).toMatchObject({ status: 'checkedIn', roomId: 'room-A2' });

    const failedCheckout = store.runInTransaction(() =>
      executeCheckOutApiRequest(
        {
          ...confirmRequest,
          roomId: 'room-A2',
          reservationId: 'res-A2-checkin',
          reservationCode: 'R-A2-CHECKIN',
          reason: ' ',
          idempotencyKey: 'sqlite-checkout-invalid-room-A2',
          correlationId: 'corr-sqlite-checkout-invalid-room-A2',
          requestFingerprint: 'sha256:sqlite-checkout-invalid-room-A2',
        },
        store.ports,
        {
          idempotency: store.apiIdempotency,
          stayLifecycle: {
            afterCheckOutConfirm: ({ request, result }) => store.recordCheckOutStay(request, result),
          },
        },
      ),
    );
    expect(failedCheckout).toMatchObject({ ok: false, mode: 'confirm' });
    const stayAfterFailedCheckout = store.readback('room-A2').stays[0];
    expect(stayAfterFailedCheckout).toMatchObject({ status: 'inHouse' });
    expect(stayAfterFailedCheckout?.checkedOutAt).toBeUndefined();

    const checkoutRequest: CheckOutConfirmApiRequest = {
      ...confirmRequest,
      roomId: 'room-A2',
      reservationId: 'res-A2-checkin',
      reservationCode: 'R-A2-CHECKIN',
      reason: 'Guest departed and returned room cards.',
      idempotencyKey: 'sqlite-checkout-confirm-room-A2',
      correlationId: 'corr-sqlite-checkout-room-A2',
      requestedAt: '2026-04-29T10:00:00.000Z',
      requestFingerprint: 'sha256:sqlite-checkout-confirm-room-A2',
    };
    const checkout = store.runInTransaction(() =>
      executeCheckOutApiRequest(checkoutRequest, store.ports, {
        idempotency: store.apiIdempotency,
        stayLifecycle: {
          afterCheckOutConfirm: ({ request, result }) => store.recordCheckOutStay(request, result),
        },
      }),
    );
    const checkoutReplay = store.runInTransaction(() =>
      executeCheckOutApiRequest(checkoutRequest, store.ports, {
        idempotency: store.apiIdempotency,
        stayLifecycle: {
          afterCheckOutConfirm: ({ request, result }) => store.recordCheckOutStay(request, result),
        },
      }),
    );
    expect(checkoutReplay).toEqual(checkout);
    expect(store.readback('room-A2').stays).toMatchObject([
      {
        reservationId: 'res-A2-checkin',
        reservationCode: 'R-A2-CHECKIN',
        roomId: 'room-A2',
        roomNumber: 'A2',
        checkedInAt: '2026-04-28T15:00:00.000Z',
        checkedOutAt: '2026-04-29T10:00:00.000Z',
        status: 'checkedOut',
      },
    ]);
    expect(store.getReservation('R-A2-CHECKIN', now)).toMatchObject({ status: 'checkedOut', roomId: 'room-A2' });
    store.close();
  });

  it('persists confirm effects and idempotency across restart', () => {
    const dbPath = tempPath('confirm.sqlite');
    const store = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });

    const confirm = store.runInTransaction(() =>
      executeCheckOutApiRequest(confirmRequest, store.ports, {
        idempotency: store.apiIdempotency,
      }),
    );
    expect(confirm).toMatchObject({ ok: true, operation: 'pms_check_out', mode: 'confirm' });
    store.close();

    const restarted = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [],
      resetOnStart: false,
      now: () => now,
    });
    const readback = restarted.readback('room-1001');
    expect(readback.rooms).toMatchObject([{ roomId: 'room-1001', occupancyStatus: 'vacant', cleaningStatus: 'dirty' }]);
    expect(readback.housekeepingTasks).toHaveLength(1);
    expect(readback.audits).toHaveLength(1);
    expect(readback.domainEvents.map((event) => event.type)).toEqual(['RoomCheckedOut', 'HousekeepingTaskCreated']);
    expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'domainEvent', projectionKind: 'roomLedger', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
      expect.objectContaining({ sourceType: 'domainEvent', projectionKind: 'housekeepingTask', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
    ]));

    const duplicate = restarted.runInTransaction(() =>
      executeCheckOutApiRequest(confirmRequest, restarted.ports, {
        idempotency: restarted.apiIdempotency,
      }),
    );
    expect(duplicate).toEqual(confirm);
    expect(restarted.readback('room-1001').housekeepingTasks).toHaveLength(1);

    const incompatible = restarted.runInTransaction(() =>
      executeCheckOutApiRequest(
        {
          ...confirmRequest,
          reason: 'Different confirm payload with the same idempotency key.',
          requestFingerprint: 'sha256:sqlite-incompatible',
        },
        restarted.ports,
        { idempotency: restarted.apiIdempotency },
      ),
    );
    expect(incompatible).toEqual({
      ok: false,
      mode: 'confirm',
      errors: [
        {
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT',
          message: 'The idempotency key was reused with a different request fingerprint.',
          field: 'requestFingerprint',
        },
      ],
    });
    restarted.close();
  });

  it('persists maintenance tickets and restored sellability across restart', () => {
    const dbPath = tempPath('maintenance.sqlite');
    const store = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [vacantCleanRoom],
      resetOnStart: true,
      now: () => now,
    });
    const reportRequest: ReportMaintenanceApiRequest = {
      operation: pmsReportMaintenanceOperation,
      mode: 'confirm',
      roomId: 'room-A2',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      reason: 'A2 air conditioner is broken.',
      idempotencyKey: 'sqlite-maintenance-report-A2',
      correlationId: 'corr-sqlite-maintenance-A2',
      requestedAt: '2026-04-28T00:00:00.000Z',
      requestFingerprint: 'sha256:sqlite-maintenance-report-A2',
      severity: 'StopSell',
      stopSellRequested: true,
      note: '空调故障，需要停售',
    };
    const reported = store.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(reportRequest, store.ports, {
        idempotency: store.apiIdempotency,
      }),
    );
    expect(reported).toMatchObject({ ok: true, operation: 'pms_report_maintenance', mode: 'confirm' });
    expect(store.inventoryIntervals({ roomId: 'room-A2', startDate: '2026-04-28', horizonDays: 1 })).toMatchObject({
      blocks: [{ roomId: 'room-A2', status: 'active', sourceType: 'maintenance_ticket' }],
      dayRooms: [{ roomId: 'room-A2', availabilityStatus: 'blocked' }],
      summaries: [{ totalRooms: 1, availableRooms: 0, blockedRooms: 1 }],
    });
    const duplicateReport = store.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(reportRequest, store.ports, {
        idempotency: store.apiIdempotency,
      }),
    );
    const incompatibleReport = store.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(
        {
          ...reportRequest,
          reason: 'Different maintenance report with reused idempotency key.',
          requestFingerprint: 'sha256:sqlite-maintenance-report-incompatible',
        },
        store.ports,
        { idempotency: store.apiIdempotency },
      ),
    );
    expect(duplicateReport).toEqual(reported);
    expect(incompatibleReport).toMatchObject({ ok: false, errors: [{ code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(store.readback('room-A2').inventoryBlocks).toHaveLength(1);
    store.close();

    const restarted = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [],
      resetOnStart: false,
      now: () => now,
    });
    const ticketId = restarted.readback('room-A2').maintenanceTickets[0]?.ticketId;
    const doneRequest: MaintenanceDoneApiRequest = {
      operation: pmsMaintenanceDoneOperation,
      mode: 'confirm',
      roomId: 'room-A2',
      actor: reportRequest.actor,
      source: 'api',
      reason: 'Maintenance completed.',
      idempotencyKey: 'sqlite-maintenance-done-A2',
      correlationId: 'corr-sqlite-maintenance-done-A2',
      requestedAt: '2026-04-28T00:01:00.000Z',
      requestFingerprint: 'sha256:sqlite-maintenance-done-A2',
      ticketId,
    };
    const restoreRequest: RestoreSellableApiRequest = {
      operation: pmsRestoreSellableOperation,
      mode: 'confirm',
      roomId: 'room-A2',
      actor: reportRequest.actor,
      source: 'api',
      reason: 'Restore room to sellable inventory.',
      idempotencyKey: 'sqlite-restore-sellable-A2',
      correlationId: 'corr-sqlite-restore-sellable-A2',
      requestedAt: '2026-04-28T00:02:00.000Z',
      requestFingerprint: 'sha256:sqlite-restore-sellable-A2',
    };

    const completed = restarted.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(doneRequest, restarted.ports, {
        idempotency: restarted.apiIdempotency,
      }),
    );
    const completedInventory = restarted.inventoryIntervals({ roomId: 'room-A2', startDate: '2026-04-28', horizonDays: 1 });
    const restored = restarted.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(restoreRequest, restarted.ports, {
        idempotency: restarted.apiIdempotency,
      }),
    );

    expect(completed).toMatchObject({ ok: true, operation: 'pms_maintenance_done', mode: 'confirm' });
    expect(completedInventory.blocks).toMatchObject([{ roomId: 'room-A2', status: 'active', blockType: 'repair' }]);
    expect(completedInventory.intervals).toEqual(expect.arrayContaining([expect.objectContaining({ calendarKind: 'blocked' })]));
    expect(restored).toMatchObject({ ok: true, operation: 'pms_restore_sellable', mode: 'confirm' });
    const readback = restarted.readback('room-A2');
    const restoredInventory = restarted.inventoryIntervals({ roomId: 'room-A2', startDate: '2026-04-28', horizonDays: 1 });
    expect(readback.rooms).toMatchObject([{ roomId: 'room-A2', saleStatus: 'sellable' }]);
    expect(readback.maintenanceTickets).toMatchObject([{ roomId: 'room-A2', status: 'resolved', stopSellRequested: true }]);
    expect(readback.inventoryBlocks).toMatchObject([{ roomId: 'room-A2', status: 'closed', endDate: '2026-04-28' }]);
    expect(restoredInventory.intervals).toEqual(expect.arrayContaining([expect.objectContaining({ calendarKind: 'available' })]));
    expect(restoredInventory.intervals.some((interval) => interval.calendarKind === 'blocked')).toBe(false);
    expect(readback.domainEvents.map((event) => event.type)).toEqual([
      'MaintenanceReported',
      'MaintenanceCompleted',
      'RoomSellabilityRestored',
    ]);
    restarted.close();
  });

  it('persists operation_requests idempotently without mutating PMS state', () => {
    const dbPath = tempPath('operation-requests.sqlite');
    const store = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });
    const request: OperationRequestCreateApiRequest = {
      propertyId: 'property-small-hotel',
      clientToken: 'form-checkout-room-1001',
      requestFingerprint: 'sha256:form-checkout-room-1001',
      source: 'external_form',
      action: 'CHECK_OUT',
      roomId: 'room-1001',
      roomNumber: '1001',
      reservationId: 'reservation-1001',
      payload: { roomNumber: '1001', action: 'CHECK_OUT' },
      requestedAt: now,
    };

    const beforeInventory = store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 });
    const created = store.createOperationRequest(request);
    const duplicate = store.createOperationRequest(request);
    const mismatch = store.createOperationRequest({
      ...request,
      requestFingerprint: 'sha256:form-checkout-room-1001-different',
      payload: { roomNumber: '1001', action: 'CHECK_OUT', note: 'different payload' },
    });
    const unsupported = store.createOperationRequest({
      ...request,
      clientToken: 'form-delete-room-1001',
      requestFingerprint: 'sha256:form-delete-room-1001',
      action: 'DELETE_ROOM',
    });

    expect(created).toMatchObject({
      ok: true,
      operation: 'pms_operation_request_create',
      idempotencyStatus: 'created',
      request: {
        propertyId: 'property-small-hotel',
        clientToken: 'form-checkout-room-1001',
        action: 'CHECK_OUT',
        status: 'queued',
        roomId: 'room-1001',
        roomNumber: '1001',
      },
    });
    expect(duplicate).toEqual({ ...created, idempotencyStatus: 'replayed' });
    expect(mismatch).toEqual({
      ok: false,
      operation: 'pms_operation_request_create',
      errors: [
        {
          code: 'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
          message: 'The operation request client token was reused with a different request fingerprint or payload.',
          field: 'requestFingerprint',
        },
      ],
    });
    expect(unsupported).toMatchObject({
      ok: false,
      errors: [{ code: 'OPERATION_REQUEST_UNSUPPORTED_ACTION', field: 'action' }],
    });

    const updated = store.updateOperationRequest({
      clientToken: 'form-checkout-room-1001',
      status: 'awaitingConfirmation',
      result: { dryRun: 'ready' },
      updatedAt: '2026-04-28T00:01:00.000Z',
    });
    expect(updated).toMatchObject({
      ok: true,
      operation: 'pms_operation_request_update',
      request: {
        clientToken: 'form-checkout-room-1001',
        status: 'awaitingConfirmation',
        resultJson: '{"dryRun":"ready"}',
      },
    });
    expect(store.getOperationRequest({ clientToken: 'form-checkout-room-1001' }).request).toMatchObject({
      status: 'awaitingConfirmation',
      resultJson: '{"dryRun":"ready"}',
    });
    expect(store.listOperationRequests({ status: 'awaitingConfirmation', roomId: 'room-1001', limit: 1, requestedAt: '2026-04-28T00:02:00.000Z' })).toMatchObject({
      ok: true,
      operation: 'pms_operation_request_list',
      count: 1,
      truncated: false,
      updatedAt: '2026-04-28T00:02:00.000Z',
      filter: { status: 'awaitingConfirmation', roomId: 'room-1001', limit: 1 },
      requests: [{ clientToken: 'form-checkout-room-1001', status: 'awaitingConfirmation', roomId: 'room-1001' }],
    });
    store.updateOperationRequest({
      clientToken: 'form-checkout-room-1001',
      status: 'failed',
      result: { errorCode: 'adapter_delivery_failed' },
      updatedAt: '2026-04-28T00:03:00.000Z',
    });

    const readback = store.readback('room-1001');
    expect(readback.operationRequests).toEqual([expect.objectContaining({ status: 'failed', resultJson: '{"errorCode":"adapter_delivery_failed"}' })]);
    expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'operationRequest', projectionKind: 'operationRequestStatus', status: 'retryable', nextAttemptAt: '2026-04-28T00:03:00.000Z', redactedError: 'operation-request-status:failed' }),
    ]));
    expect(readback.rooms).toEqual([dueOutRoom]);
    expect(readback.housekeepingTasks).toEqual([]);
    expect(readback.maintenanceTickets).toEqual([]);
    expect(readback.audits).toEqual([]);
    expect(readback.domainEvents).toEqual([]);
    expect(store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 })).toEqual(beforeInventory);
    store.close();

    const restarted = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [],
      resetOnStart: false,
      now: () => now,
    });
    expect(restarted.getOperationRequest({ clientToken: 'form-checkout-room-1001' }).request).toMatchObject({
      clientToken: 'form-checkout-room-1001',
      status: 'failed',
    });
    expect(restarted.readback('room-1001').projectionOutbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'operationRequest', status: 'retryable' }),
    ]));
    expect(restarted.readback('room-1001').rooms).toEqual([dueOutRoom]);
    restarted.close();
  });

  it('persists reservation draft lifecycle, idempotency, audit, cancel, and expiry without PMS mutations', () => {
    const dbPath = tempPath('reservation-drafts.sqlite');
    const store = createSqliteLocalSandboxStore({
      dbPath,
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });
    const createRequest: ReservationDraftCreateApiRequest = {
      operation: pmsReservationDraftCreateOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      clientToken: 'draft-sqlite-create-1',
      requestFingerprint: 'sha256:draft-sqlite-create-1',
      correlationId: 'corr-draft-sqlite-create-1',
      requestedAt: now,
      slots: { guestDisplayName: 'Guest Draft', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomTypeKeyword: '花园', selectedCandidateRef: 'availability-1:room-1001' },
      evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-1', generatedAt: now }],
      expiresAt: '2026-04-29T00:00:00.000Z',
    };

    const created = store.createReservationDraft(createRequest);
    const replayed = store.createReservationDraft(createRequest);
    const mismatch = store.createReservationDraft({ ...createRequest, requestFingerprint: 'sha256:draft-sqlite-create-1-different' });
    const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
    expect(draftRef).toMatch(/^[a-f0-9]{16}$/);
    expect(created.ok ? created.draft.draftId : undefined).toBeUndefined();
    const updateRequest: ReservationDraftUpdateApiRequest = {
      ...createRequest,
      operation: pmsReservationDraftUpdateOperation,
      clientToken: 'draft-sqlite-update-1',
      requestFingerprint: 'sha256:draft-sqlite-update-1',
      correlationId: 'corr-draft-sqlite-update-1',
      requestedAt: '2026-04-28T00:10:00.000Z',
      draftRef,
      slots: { roomId: 'room-1001', selectedCandidateRef: 'availability-1:room-1001' },
      evidenceRefs: [{ source: 'userTurn', refId: 'turn-2', generatedAt: '2026-04-28T00:10:00.000Z' }],
    };
    const updated = store.updateReservationDraft(updateRequest);
    const cancelRequest: ReservationDraftCancelApiRequest = {
      ...createRequest,
      operation: pmsReservationDraftCancelOperation,
      clientToken: 'draft-sqlite-cancel-1',
      requestFingerprint: 'sha256:draft-sqlite-cancel-1',
      correlationId: 'corr-draft-sqlite-cancel-1',
      requestedAt: '2026-04-28T00:20:00.000Z',
      draftRef,
      reason: 'guest changed plan',
    };
    const cancelled = store.cancelReservationDraft(cancelRequest);

    expect(created).toMatchObject({
      ok: true,
      operation: 'pms.reservation.draft.create',
      mutationStatus: 'draftOnly',
      idempotencyStatus: 'created',
      draft: {
        draftRef,
        status: 'quoteReady',
        slots: { guestDisplayName: 'Guest Draft', roomTypeKeyword: '花园' },
        missingSlots: [],
        evidenceRefs: [{ refId: 'availability-1' }],
        expiresAt: '2026-04-29T00:00:00.000Z',
      },
    });
    expect(replayed).toEqual(created);
    expect(mismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(updated).toMatchObject({ ok: true, operation: 'pms.reservation.draft.update', draft: { draftRef, slots: { roomId: 'room-1001' } } });
    for (const response of [created, updated, cancelled]) if (response.ok) expect(response.draft.draftId).toBeUndefined();
    expect(cancelled).toMatchObject({ ok: true, operation: 'pms.reservation.draft.cancel', draft: { draftRef, status: 'cancelled' } });

    const expired = store.createReservationDraft({
      ...createRequest,
      clientToken: 'draft-sqlite-expired-1',
      requestFingerprint: 'sha256:draft-sqlite-expired-1',
      requestedAt: '2026-04-30T00:00:00.000Z',
      expiresAt: '2026-04-29T00:00:00.000Z',
    });
    expect(expired).toMatchObject({ ok: true, draft: { status: 'expired' } });

    const readback = store.readback('room-1001');
    expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ draftRef, status: 'cancelled', missingSlots: [], evidenceRefs: expect.arrayContaining([expect.objectContaining({ refId: 'turn-2' })]) }),
      expect.objectContaining({ status: 'expired' }),
    ]));
    expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(['created', 'updated', 'cancelled', 'expired']);
    expect(readback.idempotencyRecords.filter((record) => record.operation === pmsReservationDraftCreateOperation)).toHaveLength(2);
    expect(readback.reservations).toEqual([]);
    expect(readback.operationRequests).toEqual([]);
    expect(readback.audits).toEqual([]);
    expect(readback.domainEvents).toEqual([]);
    store.close();

    const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
    expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, status: 'cancelled' })]));
    restarted.close();
  });

  it('persists reservation quote and prepareConfirm refs without final PMS mutations', () => {
    const dbPath = tempPath('reservation-draft-quote-prepare.sqlite');
    const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom], resetOnStart: true, now: () => now });
    const baseCreate: ReservationDraftCreateApiRequest = {
      operation: pmsReservationDraftCreateOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      clientToken: 'draft-sqlite-quote-create-1',
      requestFingerprint: 'sha256:draft-sqlite-quote-create-1',
      correlationId: 'corr-draft-sqlite-quote-create-1',
      requestedAt: now,
      slots: { guestDisplayName: 'Quote Guest', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-quote-1:room-1001' },
      evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-quote-1', generatedAt: now }],
      expiresAt: '2026-05-03T00:00:00.000Z',
    };
    const created = store.createReservationDraft(baseCreate);
    const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
    const quoteRequest: ReservationQuoteApiRequest = {
      ...baseCreate,
      operation: pmsReservationQuoteOperation,
      clientToken: 'draft-sqlite-quote-1',
      requestFingerprint: 'sha256:draft-sqlite-quote-1',
      correlationId: 'corr-draft-sqlite-quote-1',
      requestedAt: '2026-04-28T00:05:00.000Z',
      draftRef,
    };
    const quoted = store.quoteReservationDraft(quoteRequest);
    const replayedQuote = store.quoteReservationDraft(quoteRequest);
    const quoteMismatch = store.quoteReservationDraft({ ...quoteRequest, requestFingerprint: 'sha256:draft-sqlite-quote-1-different' });
    const quoteRef = quoted.ok ? quoted.draft.quote!.quoteRef : 'missing-quote';
    const prepareRequest: ReservationPrepareConfirmApiRequest = {
      ...baseCreate,
      operation: pmsReservationPrepareConfirmOperation,
      clientToken: 'draft-sqlite-prepare-1',
      requestFingerprint: 'sha256:draft-sqlite-prepare-1',
      correlationId: 'corr-draft-sqlite-prepare-1',
      requestedAt: '2026-04-28T00:10:00.000Z',
      draftRef,
      quoteRef,
    };
    const prepared = store.prepareConfirmReservationDraft(prepareRequest);
    const replayedPrepare = store.prepareConfirmReservationDraft(prepareRequest);
    const prepareMismatch = store.prepareConfirmReservationDraft({ ...prepareRequest, requestFingerprint: 'sha256:draft-sqlite-prepare-1-different' });
    if (prepared.ok) {
      expect(quoteRef).toMatch(/^quote-[a-f0-9]{16}$/);
      expect(prepared.draft.pendingAction?.pendingActionRef).toMatch(/^pending-action-[a-f0-9]{16}$/);
      expect(prepared.draft.pendingAction?.cardPayloadRef).toMatch(/^card-payload-[a-f0-9]{16}$/);
    }

    const missingSlots = store.createReservationDraft({
      ...baseCreate,
      clientToken: 'draft-sqlite-quote-missing-create-1',
      requestFingerprint: 'sha256:draft-sqlite-quote-missing-create-1',
      slots: { guestDisplayName: 'Missing Slots' },
    });
    const missingSlotsQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-missing-1', requestFingerprint: 'sha256:draft-sqlite-quote-missing-1', draftRef: missingSlots.ok ? missingSlots.draft.draftRef : 'missing' });
    const expired = store.createReservationDraft({
      ...baseCreate,
      clientToken: 'draft-sqlite-quote-expired-create-1',
      requestFingerprint: 'sha256:draft-sqlite-quote-expired-create-1',
      requestedAt: '2026-04-30T00:00:00.000Z',
      expiresAt: '2026-04-29T00:00:00.000Z',
    });
    const expiredQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-expired-1', requestFingerprint: 'sha256:draft-sqlite-quote-expired-1', draftRef: expired.ok ? expired.draft.draftRef : 'missing' });
    const cancelTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'draft-sqlite-quote-cancel-create-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancel-create-1' });
    const cancelDraftRef = cancelTarget.ok ? cancelTarget.draft.draftRef! : 'missing';
    store.cancelReservationDraft({ ...baseCreate, operation: pmsReservationDraftCancelOperation, clientToken: 'draft-sqlite-quote-cancel-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancel-1', draftRef: cancelDraftRef, reason: 'test cancel' });
    const cancelledQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-cancelled-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancelled-1', draftRef: cancelDraftRef });
    const notFoundQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-not-found-1', requestFingerprint: 'sha256:draft-sqlite-quote-not-found-1', draftRef: '0000000000000000' });

    const staleTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'draft-sqlite-stale-quote-create-1', requestFingerprint: 'sha256:draft-sqlite-stale-quote-create-1' });
    const staleDraftRef = staleTarget.ok ? staleTarget.draft.draftRef! : 'missing';
    const staleQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-stale-quote-1', requestFingerprint: 'sha256:draft-sqlite-stale-quote-1', draftRef: staleDraftRef });
    const staleQuoteRef = staleQuote.ok ? staleQuote.draft.quote!.quoteRef : 'missing-stale-quote';
    store.updateReservationDraft({
      ...baseCreate,
      operation: pmsReservationDraftUpdateOperation,
      clientToken: 'draft-sqlite-stale-update-1',
      requestFingerprint: 'sha256:draft-sqlite-stale-update-1',
      correlationId: 'corr-draft-sqlite-stale-update-1',
      requestedAt: '2026-04-28T00:08:00.000Z',
      draftRef: staleDraftRef,
      slots: { ...baseCreate.slots, roomId: 'room-1002', selectedCandidateRef: 'availability-quote-2:room-1002' },
    });
    const stalePrepare = store.prepareConfirmReservationDraft({
      ...prepareRequest,
      clientToken: 'draft-sqlite-stale-prepare-1',
      requestFingerprint: 'sha256:draft-sqlite-stale-prepare-1',
      draftRef: staleDraftRef,
      quoteRef: staleQuoteRef,
    });

    expect(quoted).toMatchObject({
      ok: true,
      operation: 'pms.reservation.quote',
      mutationStatus: 'draftOnly',
      idempotencyStatus: 'quoted',
      draft: { draftRef, status: 'quoteReady', quote: { status: 'pricingUnsupported', capabilityGap: { code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED' } } },
    });
    expect(replayedQuote).toEqual(quoted);
    expect(quoteMismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(prepared).toMatchObject({
      ok: true,
      operation: 'pms.reservation.prepare_confirm',
      mutationStatus: 'draftOnly',
      idempotencyStatus: 'prepared',
      draft: { draftRef, status: 'awaitingConfirmation', quote: { quoteRef }, pendingAction: { quoteRef, confirmationMode: 'typedCardOnly', mutationStatus: 'none' } }
    });
    for (const response of [created, quoted, prepared]) if (response.ok) expect(response.draft.draftId).toBeUndefined();
    expect(replayedPrepare).toEqual(prepared);
    expect(prepareMismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(missingSlotsQuote).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS' }] });
    expect(expiredQuote).toMatchObject({ ok: false, status: 'rejected', draft: { status: 'expired' }, errors: [{ code: 'RESERVATION_DRAFT_EXPIRED' }] });
    expect(cancelledQuote).toMatchObject({ ok: false, status: 'rejected', draft: { status: 'cancelled' }, errors: [{ code: 'RESERVATION_DRAFT_NOT_ACTIVE' }] });
    expect(notFoundQuote).toMatchObject({ ok: false, status: 'notFound', errors: [{ code: 'RESERVATION_DRAFT_NOT_FOUND' }] });
    expect(stalePrepare).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_QUOTE_REQUIRED' }] });

    const readback = store.readback('room-1001');
    expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ draftRef, status: 'awaitingConfirmation', quote: expect.objectContaining({ quoteRef }), pendingAction: expect.objectContaining({ quoteRef }) }),
    ]));
    expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(expect.arrayContaining(['created', 'quoted', 'prepared', 'cancelled']));
    expect(readback.reservations).toEqual([]);
    expect(readback.operationRequests).toEqual([]);
    expect(readback.audits).toEqual([]);
    expect(readback.domainEvents).toEqual([]);
    store.close();

    const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
    expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ draftRef, status: 'awaitingConfirmation', quote: expect.objectContaining({ quoteRef }), pendingAction: expect.objectContaining({ quoteRef }) }),
    ]));
    restarted.close();
  });

  it('persists platform pending-action status, confirm, cancel, replay, conflicts, and expiry without final PMS mutation', () => {
    const dbPath = tempPath('pending-action-callback.sqlite');
    const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom], resetOnStart: true, now: () => now });
    const baseCreate: ReservationDraftCreateApiRequest = {
      operation: pmsReservationDraftCreateOperation,
      propertyId: 'property-small-hotel',
      actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
      source: 'api',
      clientToken: 'pending-sqlite-create-1',
      requestFingerprint: 'sha256:pending-sqlite-create-1',
      correlationId: 'corr-pending-sqlite-create-1',
      requestedAt: now,
      slots: { guestDisplayName: 'Pending Guest', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-pending-sqlite-1:room-1001' },
      evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-pending-sqlite-1', generatedAt: now }],
      expiresAt: '2026-05-03T00:00:00.000Z',
    };
    const created = store.createReservationDraft(baseCreate);
    const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
    const quoted = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-quote-1', requestFingerprint: 'sha256:pending-sqlite-quote-1', correlationId: 'corr-pending-sqlite-quote-1', draftRef });
    const quoteRef = quoted.ok ? quoted.draft.quote!.quoteRef : 'missing-quote';
    const prepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-prepare-1', requestFingerprint: 'sha256:pending-sqlite-prepare-1', correlationId: 'corr-pending-sqlite-prepare-1', draftRef, quoteRef });
    const pendingActionRef = prepared.ok ? prepared.draft.pendingAction!.pendingActionRef : 'missing-pending';
    const cardPayloadRef = prepared.ok ? prepared.draft.pendingAction!.cardPayloadRef : 'missing-card';
    const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-callback-1' };
    const status = store.getPendingActionStatus({ operation: pmsPendingActionStatusOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-status-1', requestFingerprint: 'sha256:pending-sqlite-status-1', correlationId: 'corr-pending-sqlite-status-1', requestedAt: '2026-04-28T00:11:00.000Z', cardPayloadRef });
    const confirmRequest = { operation: pmsPendingActionConfirmOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-confirm-1', requestFingerprint: 'sha256:pending-sqlite-confirm-1', correlationId: 'corr-pending-sqlite-confirm-1', requestedAt: '2026-04-28T00:12:00.000Z', cardPayloadRef } as const;
    const cardPayloadMismatch = store.confirmPendingAction({ ...confirmRequest, clientToken: 'pending-sqlite-card-mismatch-1', requestFingerprint: 'sha256:pending-sqlite-card-mismatch-1', cardPayloadRef: 'card-payload-ref-tampered' });
    const confirmed = store.confirmPendingAction(confirmRequest);
    const replayedConfirm = store.confirmPendingAction(confirmRequest);
    const confirmMismatch = store.confirmPendingAction({ ...confirmRequest, requestFingerprint: 'sha256:pending-sqlite-confirm-different' });
    const wrongOperationToken = store.getPendingActionStatus({ operation: pmsPendingActionStatusOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: baseCreate.clientToken, requestFingerprint: baseCreate.requestFingerprint, correlationId: 'corr-pending-sqlite-status-wrong-op-1', requestedAt: '2026-04-28T00:12:30.000Z', cardPayloadRef });
    const inactiveCancel = store.cancelPendingAction({ operation: pmsPendingActionCancelOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-inactive-cancel-1', requestFingerprint: 'sha256:pending-sqlite-inactive-cancel-1', correlationId: 'corr-pending-sqlite-inactive-cancel-1', requestedAt: '2026-04-28T00:13:00.000Z', cardPayloadRef, reason: 'too late' });

    const cancelTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'pending-sqlite-cancel-create-1', requestFingerprint: 'sha256:pending-sqlite-cancel-create-1', correlationId: 'corr-pending-sqlite-cancel-create-1' });
    const cancelDraftRef = cancelTarget.ok ? cancelTarget.draft.draftRef! : 'missing-cancel-draft';
    const cancelQuote = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-cancel-quote-1', requestFingerprint: 'sha256:pending-sqlite-cancel-quote-1', correlationId: 'corr-pending-sqlite-cancel-quote-1', draftRef: cancelDraftRef });
    const cancelPrepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-cancel-prepare-1', requestFingerprint: 'sha256:pending-sqlite-cancel-prepare-1', correlationId: 'corr-pending-sqlite-cancel-prepare-1', draftRef: cancelDraftRef, quoteRef: cancelQuote.ok ? cancelQuote.draft.quote!.quoteRef : 'missing-cancel-quote' });
    const cancelled = store.cancelPendingAction({ operation: pmsPendingActionCancelOperation, pendingActionRef: cancelPrepared.ok ? cancelPrepared.draft.pendingAction!.pendingActionRef : 'missing-cancel-pending', actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-cancel-1', requestFingerprint: 'sha256:pending-sqlite-cancel-1', correlationId: 'corr-pending-sqlite-cancel-1', requestedAt: '2026-04-28T00:14:00.000Z', cardPayloadRef: cancelPrepared.ok ? cancelPrepared.draft.pendingAction!.cardPayloadRef : 'missing-cancel-card', reason: 'guest cancelled card' });

    const expiredTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'pending-sqlite-expire-create-1', requestFingerprint: 'sha256:pending-sqlite-expire-create-1', correlationId: 'corr-pending-sqlite-expire-create-1', expiresAt: '2026-04-28T00:10:00.000Z' });
    const expiredDraftRef = expiredTarget.ok ? expiredTarget.draft.draftRef! : 'missing-expired-draft';
    const expiredQuote = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-expire-quote-1', requestFingerprint: 'sha256:pending-sqlite-expire-quote-1', correlationId: 'corr-pending-sqlite-expire-quote-1', requestedAt: '2026-04-28T00:01:00.000Z', draftRef: expiredDraftRef });
    const expiredPrepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-expire-prepare-1', requestFingerprint: 'sha256:pending-sqlite-expire-prepare-1', correlationId: 'corr-pending-sqlite-expire-prepare-1', requestedAt: '2026-04-28T00:02:00.000Z', draftRef: expiredDraftRef, quoteRef: expiredQuote.ok ? expiredQuote.draft.quote!.quoteRef : 'missing-expire-quote' });
    const expired = store.confirmPendingAction({ operation: pmsPendingActionConfirmOperation, pendingActionRef: expiredPrepared.ok ? expiredPrepared.draft.pendingAction!.pendingActionRef : 'missing-expired-pending', actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-expired-confirm-1', requestFingerprint: 'sha256:pending-sqlite-expired-confirm-1', correlationId: 'corr-pending-sqlite-expired-confirm-1', requestedAt: '2026-04-28T00:15:00.000Z', cardPayloadRef: expiredPrepared.ok ? expiredPrepared.draft.pendingAction!.cardPayloadRef : 'missing-expired-card' });

    expect(status).toMatchObject({ ok: true, operation: 'pms.pending_action.status', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation' } });
    expect(cardPayloadMismatch).toMatchObject({ ok: false, operation: 'pms.pending_action.confirm', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation', cardPayloadRef }, errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH', field: 'cardPayloadRef' }] });
    expect(confirmed).toMatchObject({ ok: true, operation: 'pms.pending_action.confirm', mutationStatus: 'deferred', pendingAction: { pendingActionRef, status: 'confirmed', mutationStatus: 'deferred' } });
    expect(replayedConfirm).toEqual(confirmed);
    expect(confirmMismatch).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(wrongOperationToken).toMatchObject({ ok: false, operation: 'pms.pending_action.status', errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
    expect(inactiveCancel).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE' }] });
    expect(cancelled).toMatchObject({ ok: true, operation: 'pms.pending_action.cancel', mutationStatus: 'none', pendingAction: { status: 'cancelled' } });
    expect(expired).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_EXPIRED' }], pendingAction: { status: 'expired' } });

    const readback = store.readback('room-1001');
    expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ draftRef, status: 'awaitingConfirmation', pendingAction: expect.objectContaining({ pendingActionRef, status: 'confirmed', mutationStatus: 'deferred' }) }),
      expect.objectContaining({ draftRef: cancelDraftRef, status: 'cancelled', pendingAction: expect.objectContaining({ status: 'cancelled' }) }),
      expect.objectContaining({ draftRef: expiredDraftRef, status: 'expired', pendingAction: expect.objectContaining({ status: 'expired' }) }),
    ]));
    expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(expect.arrayContaining(['pendingActionStatusRead', 'pendingActionConfirmed', 'pendingActionCancelled', 'pendingActionExpired']));
    const exposedAuditSurface = JSON.stringify(readback.reservationDraftAudits);
    expect(exposedAuditSurface).not.toContain(pendingActionRef);
    expect(exposedAuditSurface).not.toContain(cardPayloadRef);
    expect(exposedAuditSurface).not.toContain(confirmRequest.clientToken);
    expect(exposedAuditSurface).not.toContain(baseCreate.actor.id);
    expect(readback.idempotencyRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: pmsPendingActionStatusOperation, mode: 'confirm', ok: true }),
      expect.objectContaining({ operation: pmsPendingActionConfirmOperation, mode: 'confirm', ok: true }),
      expect.objectContaining({ operation: pmsPendingActionCancelOperation, mode: 'confirm', ok: true }),
    ]));
    expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'reservationDraftAudit', projectionKind: 'reservationWorkflow', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
    ]));
    const exposedOutboxSurface = JSON.stringify(readback.projectionOutbox);
    expect(exposedOutboxSurface).not.toContain(pendingActionRef);
    expect(exposedOutboxSurface).not.toContain(cardPayloadRef);
    expect(exposedOutboxSurface).not.toContain(confirmRequest.clientToken);
    expect(readback.reservations).toEqual([]);
    expect(readback.operationRequests).toEqual([]);
    expect(readback.audits).toEqual([]);
    expect(readback.domainEvents).toEqual([]);
    store.close();

    const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
    expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, pendingAction: expect.objectContaining({ status: 'confirmed' }) })]));
    restarted.close();
  });

  it('resets SQLite state back to explicit seed rooms', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('reset.sqlite'),
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });
    const confirm = store.runInTransaction(() => executeCheckOutApiRequest(confirmRequest, store.ports, { idempotency: store.apiIdempotency }));
    expect(confirm.ok).toBe(true);

    const reset = store.reset([dueOutRoom]);
    expect(reset.rooms).toEqual([dueOutRoom]);
    expect(reset.operationRequests).toEqual([]);
    expect(reset.housekeepingTasks).toEqual([]);
    expect(reset.audits).toEqual([]);
    expect(reset.domainEvents).toEqual([]);
    expect(reset.idempotencyRecords).toEqual([]);
    store.close();
  });
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

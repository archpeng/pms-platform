import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeCheckOutApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckOutOperation,
  pmsMaintenanceDoneOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type MaintenanceDoneApiRequest,
  type ReportMaintenanceApiRequest,
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
          status: 'checkedIn',
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
        roomId: 'room-A2',
        status: 'checkedIn',
      },
    ]);
    expect(store.todayArrivals('2026-04-28', now).reservations).toHaveLength(1);
    expect(store.roomReservationContext('room-A2', now).reservations[0]).toMatchObject({
      reservationCode: 'R-A2-1',
      status: 'checkedIn',
    });
    store.close();
  });

  it('keeps dry-run non-mutating while recording API idempotency', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('dry-run.sqlite'),
      seedRooms: [dueOutRoom],
      resetOnStart: true,
      now: () => now,
    });

    const dryRun = store.runInTransaction(() =>
      executeCheckOutApiRequest(dryRunRequest, store.ports, {
        idempotency: store.apiIdempotency,
      }),
    );

    expect(dryRun).toMatchObject({ ok: true, operation: 'pms_check_out', mode: 'dryRun' });
    const readback = store.readback('room-1001');
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
    const restored = restarted.runInTransaction(() =>
      executePmsExtendedCommandApiRequest(restoreRequest, restarted.ports, {
        idempotency: restarted.apiIdempotency,
      }),
    );

    expect(completed).toMatchObject({ ok: true, operation: 'pms_maintenance_done', mode: 'confirm' });
    expect(restored).toMatchObject({ ok: true, operation: 'pms_restore_sellable', mode: 'confirm' });
    const readback = restarted.readback('room-A2');
    expect(readback.rooms).toMatchObject([{ roomId: 'room-A2', saleStatus: 'sellable' }]);
    expect(readback.maintenanceTickets).toMatchObject([{ roomId: 'room-A2', status: 'resolved', stopSellRequested: true }]);
    expect(readback.domainEvents.map((event) => event.type)).toEqual([
      'MaintenanceReported',
      'MaintenanceCompleted',
      'RoomSellabilityRestored',
    ]);
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

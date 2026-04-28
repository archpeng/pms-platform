import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pmsCheckOutOperation, type CheckOutConfirmApiRequest, type CheckOutDryRunApiRequest, executeCheckOutApiRequest } from '../src/index.js';
import {
  createSqliteLocalSandboxStore,
  pmsSqliteDbPathEnvName,
} from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  occupancyStatus: 'dueOut',
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

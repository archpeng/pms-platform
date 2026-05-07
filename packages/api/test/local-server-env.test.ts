import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLocalSandboxStoreFromEnv,
  pmsSandboxResetOnStartEnvName,
  pmsSandboxSeedRoomIdEnvName,
  pmsSandboxSeedRoomNumberEnvName,
} from '../src/localServerMain.js';
import {
  pmsSqliteDbPathEnvName,
  startPmsLocalHttpServer,
  type PmsLocalSandboxStore,
} from '../src/localSandbox.js';

const tmpRoots: string[] = [];
const stores: PmsLocalSandboxStore[] = [];

afterEach(() => {
  while (stores.length > 0) {
    stores.pop()?.close?.();
  }
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('PMS local server storage selection', () => {
  it('defaults to SQLite storage', async () => {
    const store = await createLocalSandboxStoreFromEnv({
      [pmsSandboxResetOnStartEnvName]: 'true',
    });
    stores.push(store);

    expect(store.storage).toMatchObject({
      kind: 'sqlite',
      envName: pmsSqliteDbPathEnvName,
      driver: 'node:sqlite',
      experimental: true,
    });
    expect(store.readback().rooms).toMatchObject([
      { roomId: 'room-A1', roomNumber: 'A1', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-A2', roomNumber: 'A2', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-B1', roomNumber: 'B1', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-B2', roomNumber: 'B2', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-C1', roomNumber: 'C1', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-C2', roomNumber: 'C2', roomType: '花园套房', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-D1', roomNumber: 'D1', roomType: '秘境洞穴', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-D2', roomNumber: 'D2', roomType: '秘境洞穴', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-D3', roomNumber: 'D3', roomType: '秘境洞穴', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-D4', roomNumber: 'D4', roomType: '秘境洞穴', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-D5', roomNumber: 'D5', roomType: '秘境洞穴', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-E1', roomNumber: 'E1', roomType: '花园套房', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
      { roomId: 'room-E2', roomNumber: 'E2', roomType: '花园别墅', occupancyStatus: 'vacant', cleaningStatus: 'clean', saleStatus: 'sellable' },
    ]);
    expect(store.readback().roomTypes.map((roomType) => roomType.displayName).sort()).toEqual(['秘境洞穴', '花园别墅', '花园套房'].sort());
  });

  it('starts the HTTP boundary with sqlite storage path selected by env', async () => {
    const store = await createLocalSandboxStoreFromEnv({
      [pmsSqliteDbPathEnvName]: tempPath('pms.sqlite'),
      [pmsSandboxResetOnStartEnvName]: 'true',
      [pmsSandboxSeedRoomIdEnvName]: 'room-2001',
      [pmsSandboxSeedRoomNumberEnvName]: '2001',
    });
    stores.push(store);

    const started = await startPmsLocalHttpServer({
      store,
      auth: { required: false },
      projectionDispatcher: {
        enabled: true,
        configured: true,
        adapterBaseUrlEnvName: 'PMS_PLATFORM_ADAPTER_PMS_BASE_URL',
        tokenEnvName: 'PMS_PLATFORM_ADAPTER_PMS_BASE_TOKEN',
        intervalMs: 5000,
        batchSize: 25,
        timeoutMs: 5000,
        maxAttempts: 5,
        rawAdapterUrlLogged: false,
        rawTokenLogged: false,
      },
    });
    try {
      const health = await fetch(`${started.url}/health`);
      expect(await health.json()).toMatchObject({
        ok: true,
        service: 'pms-platform',
        storage: {
          kind: 'sqlite',
          envName: pmsSqliteDbPathEnvName,
          driver: 'node:sqlite',
          experimental: true,
        },
        projectionDispatcher: {
          enabled: true,
          configured: true,
          adapterBaseUrlEnvName: 'PMS_PLATFORM_ADAPTER_PMS_BASE_URL',
          tokenEnvName: 'PMS_PLATFORM_ADAPTER_PMS_BASE_TOKEN',
          rawAdapterUrlLogged: false,
          rawTokenLogged: false,
        },
      });
    } finally {
      await started.close();
      stores.pop();
    }
  });

});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-local-server-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

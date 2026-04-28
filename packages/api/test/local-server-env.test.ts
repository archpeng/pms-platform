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
    expect(store.readback().rooms).toMatchObject([{ roomId: 'room-1001', roomNumber: '1001' }]);
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

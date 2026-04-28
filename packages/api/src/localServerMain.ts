import { resolve } from 'node:path';
import {
  pmsLocalAuthTokenEnvName,
  pmsSqliteDbPathEnvName,
  startPmsLocalHttpServer,
  type PmsLocalSandboxStore,
} from './localSandbox.js';
import { createSqliteLocalSandboxStore } from './sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

export const pmsLocalHostEnvName = 'PMS_PLATFORM_LOCAL_HOST';
export const pmsLocalPortEnvName = 'PMS_PLATFORM_LOCAL_PORT';
export const pmsLocalAuthRequiredEnvName = 'PMS_PLATFORM_LOCAL_AUTH_REQUIRED';
export const pmsSandboxResetOnStartEnvName = 'PMS_PLATFORM_SANDBOX_RESET_ON_START';
export const pmsSandboxSeedRoomIdEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_ID';
export const pmsSandboxSeedRoomNumberEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_NUMBER';

export const defaultSqliteDbPath = '.local/pms.sqlite';

type LocalServerEnv = Record<string, string | undefined>;

export async function main(): Promise<void> {
  const host = process.env[pmsLocalHostEnvName] ?? '127.0.0.1';
  const port = Number.parseInt(process.env[pmsLocalPortEnvName] ?? '8791', 10);
  const authRequired = process.env[pmsLocalAuthRequiredEnvName] !== 'false';
  const resetOnStart = process.env[pmsSandboxResetOnStartEnvName] === 'true';
  const store = await createLocalSandboxStoreFromEnv(process.env);
  const started = await startPmsLocalHttpServer({
    host,
    port,
    store,
    auth: {
      envName: pmsLocalAuthTokenEnvName,
      required: authRequired,
    },
  });

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      service: 'pms-platform',
      boundary: 'pms-checkout-local-sandbox',
      url: started.url,
      storage: store.storage,
      sqliteDbPathEnvName: pmsSqliteDbPathEnvName,
      authEnvName: pmsLocalAuthTokenEnvName,
      authRequired,
      resetOnStart,
    })}\n`,
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void started.close().finally(() => process.exit(0));
    });
  }
}

export async function createLocalSandboxStoreFromEnv(env: LocalServerEnv = process.env): Promise<PmsLocalSandboxStore> {
  const seedRoom = createSeedRoomFromEnv(env);
  const resetOnStart = env[pmsSandboxResetOnStartEnvName] === 'true';

  return createSqliteLocalSandboxStore({
    dbPath: resolve(env[pmsSqliteDbPathEnvName] ?? defaultSqliteDbPath),
    seedRooms: [seedRoom],
    resetOnStart,
  });
}

function createSeedRoomFromEnv(env: LocalServerEnv = process.env): RoomAggregate {
  return {
    roomId: env[pmsSandboxSeedRoomIdEnvName] ?? 'room-1001',
    roomNumber: env[pmsSandboxSeedRoomNumberEnvName] ?? '1001',
    occupancyStatus: 'dueOut',
    cleaningStatus: 'clean',
    saleStatus: 'sellable',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}

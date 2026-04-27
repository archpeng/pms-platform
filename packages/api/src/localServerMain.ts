import { resolve } from 'node:path';
import { createDurableLocalSandboxStore, pmsLocalAuthTokenEnvName, pmsSandboxStatePathEnvName, startPmsLocalHttpServer } from './localSandbox.js';
import type { RoomAggregate } from '@pms-platform/core';

export const pmsLocalHostEnvName = 'PMS_PLATFORM_LOCAL_HOST';
export const pmsLocalPortEnvName = 'PMS_PLATFORM_LOCAL_PORT';
export const pmsLocalAuthRequiredEnvName = 'PMS_PLATFORM_LOCAL_AUTH_REQUIRED';
export const pmsSandboxResetOnStartEnvName = 'PMS_PLATFORM_SANDBOX_RESET_ON_START';
export const pmsSandboxSeedRoomIdEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_ID';
export const pmsSandboxSeedRoomNumberEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_NUMBER';

const defaultStatePath = '.local/pms-checkout-sandbox-state.json';

export async function main(): Promise<void> {
  const statePath = resolve(process.env[pmsSandboxStatePathEnvName] ?? defaultStatePath);
  const host = process.env[pmsLocalHostEnvName] ?? '127.0.0.1';
  const port = Number.parseInt(process.env[pmsLocalPortEnvName] ?? '8791', 10);
  const authRequired = process.env[pmsLocalAuthRequiredEnvName] !== 'false';
  const resetOnStart = process.env[pmsSandboxResetOnStartEnvName] === 'true';
  const seedRoom = createSeedRoomFromEnv();
  const store = createDurableLocalSandboxStore({
    statePath,
    seedRooms: [seedRoom],
    resetOnStart,
  });
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
      statePathEnvName: pmsSandboxStatePathEnvName,
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

function createSeedRoomFromEnv(): RoomAggregate {
  return {
    roomId: process.env[pmsSandboxSeedRoomIdEnvName] ?? 'room-1001',
    roomNumber: process.env[pmsSandboxSeedRoomNumberEnvName] ?? '1001',
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

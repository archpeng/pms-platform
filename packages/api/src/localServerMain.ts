import { resolve } from 'node:path';
import {
  pmsLocalAuthTokenEnvName,
  pmsSqliteDbPathEnvName,
  startPmsLocalHttpServer,
  type PmsLocalSandboxStore,
} from './localSandbox.js';
import {
  pmsProjectionDispatchAdapterBaseUrlEnvName,
  pmsProjectionDispatchAdapterTokenEnvName,
  pmsProjectionDispatchBatchSizeEnvName,
  pmsProjectionDispatchEnabledEnvName,
  pmsProjectionDispatchIntervalMsEnvName,
  pmsProjectionDispatchMaxAttemptsEnvName,
  pmsProjectionDispatchTimeoutMsEnvName,
  startProjectionDispatcher,
  type PmsProjectionDispatcherOptions,
  type StartedPmsProjectionDispatcher,
} from './projectionDispatcher.js';
import { createSqliteLocalSandboxStore } from './sqliteSandboxStore.js';
import {
  roomTypeForSmallHotelRoomNumber,
  roomTypeIdForSmallHotelRoomType,
  smallHotelPropertyId,
  smallHotelRoomNumbers,
} from '@pms-platform/contracts';
import type { RoomAggregate } from '@pms-platform/core';

export const pmsLocalHostEnvName = 'PMS_PLATFORM_LOCAL_HOST';
export const pmsLocalPortEnvName = 'PMS_PLATFORM_LOCAL_PORT';
export const pmsLocalAuthRequiredEnvName = 'PMS_PLATFORM_LOCAL_AUTH_REQUIRED';
export const pmsSandboxResetOnStartEnvName = 'PMS_PLATFORM_SANDBOX_RESET_ON_START';
export const pmsSandboxSeedRoomIdEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_ID';
export const pmsSandboxSeedRoomNumberEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_NUMBER';

export const defaultSqliteDbPath = '.local/pms.sqlite';
export const defaultSmallHotelRoomNumbers = smallHotelRoomNumbers;

type LocalServerEnv = Record<string, string | undefined>;

export async function main(): Promise<void> {
  const host = process.env[pmsLocalHostEnvName] ?? '127.0.0.1';
  const port = Number.parseInt(process.env[pmsLocalPortEnvName] ?? '8791', 10);
  const authRequired = process.env[pmsLocalAuthRequiredEnvName] !== 'false';
  const resetOnStart = process.env[pmsSandboxResetOnStartEnvName] === 'true';
  const store = await createLocalSandboxStoreFromEnv(process.env);
  const projectionDispatcherConfig = resolveProjectionDispatcherConfig(process.env, store);
  let projectionDispatcher: StartedPmsProjectionDispatcher | undefined;
  const started = await startPmsLocalHttpServer({
    host,
    port,
    store,
    auth: {
      envName: pmsLocalAuthTokenEnvName,
      required: authRequired,
    },
    projectionDispatcher: projectionDispatcherHealthFromConfig(projectionDispatcherConfig),
  });
  if (projectionDispatcherConfig.enabled) {
    projectionDispatcher = startProjectionDispatcher(projectionDispatcherConfig.options);
  }

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
      projectionDispatcher: projectionDispatcherHealthFromConfig(projectionDispatcherConfig),
    })}\n`,
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void Promise.resolve()
        .then(() => projectionDispatcher?.stop())
        .then(() => started.close())
        .finally(() => process.exit(0));
    });
  }
}

export async function createLocalSandboxStoreFromEnv(env: LocalServerEnv = process.env): Promise<PmsLocalSandboxStore> {
  const seedRooms = createSeedRoomsFromEnv(env);
  const resetOnStart = env[pmsSandboxResetOnStartEnvName] === 'true';

  return createSqliteLocalSandboxStore({
    dbPath: resolve(env[pmsSqliteDbPathEnvName] ?? defaultSqliteDbPath),
    seedRooms,
    resetOnStart,
  });
}

function createSeedRoomsFromEnv(env: LocalServerEnv = process.env): readonly RoomAggregate[] {
  if (env[pmsSandboxSeedRoomIdEnvName] || env[pmsSandboxSeedRoomNumberEnvName]) {
    const roomNumber = env[pmsSandboxSeedRoomNumberEnvName] ?? 'A1';
    return [cleanSellableSeedRoom(env[pmsSandboxSeedRoomIdEnvName] ?? `room-${roomNumber}`, roomNumber)];
  }
  return defaultSmallHotelRoomNumbers.map((roomNumber) => cleanSellableSeedRoom(`room-${roomNumber}`, roomNumber));
}

function cleanSellableSeedRoom(roomId: string, roomNumber: string): RoomAggregate {
  const roomType = roomTypeForSmallHotelRoomNumber(roomNumber);
  return {
    roomId,
    roomNumber,
    propertyId: smallHotelPropertyId,
    roomTypeId: roomTypeIdForSmallHotelRoomType(roomType),
    roomType,
    zone: roomNumber.slice(0, 1),
    sortKey: roomNumber,
    occupancyStatus: 'vacant',
    cleaningStatus: 'clean',
    saleStatus: 'sellable',
  };
}

interface ProjectionDispatcherRuntimeConfig {
  readonly enabled: boolean;
  readonly options: PmsProjectionDispatcherOptions;
}

function resolveProjectionDispatcherConfig(env: LocalServerEnv, store: PmsLocalSandboxStore): ProjectionDispatcherRuntimeConfig {
  const enabled = env[pmsProjectionDispatchEnabledEnvName] === 'true';
  const intervalMs = positiveIntEnv(env, pmsProjectionDispatchIntervalMsEnvName, 5000);
  const batchSize = positiveIntEnv(env, pmsProjectionDispatchBatchSizeEnvName, 25);
  const timeoutMs = positiveIntEnv(env, pmsProjectionDispatchTimeoutMsEnvName, 5000);
  const maxAttempts = positiveIntEnv(env, pmsProjectionDispatchMaxAttemptsEnvName, 5);
  const adapterBaseUrl = env[pmsProjectionDispatchAdapterBaseUrlEnvName];
  const adapterToken = env[pmsProjectionDispatchAdapterTokenEnvName];

  if (enabled && !adapterBaseUrl) {
    throw new Error(`${pmsProjectionDispatchAdapterBaseUrlEnvName} is required when ${pmsProjectionDispatchEnabledEnvName}=true`);
  }
  if (enabled && !adapterToken) {
    throw new Error(`${pmsProjectionDispatchAdapterTokenEnvName} is required when ${pmsProjectionDispatchEnabledEnvName}=true`);
  }

  return {
    enabled,
    options: {
      store,
      adapterBaseUrl: adapterBaseUrl ?? 'http://127.0.0.1:8787',
      adapterToken: adapterToken ?? '',
      intervalMs,
      batchSize,
      timeoutMs,
      maxAttempts,
    },
  };
}

function projectionDispatcherHealthFromConfig(config: ProjectionDispatcherRuntimeConfig) {
  return {
    enabled: config.enabled,
    configured: config.enabled && Boolean(config.options.adapterBaseUrl && config.options.adapterToken),
    adapterBaseUrlEnvName: pmsProjectionDispatchAdapterBaseUrlEnvName,
    tokenEnvName: pmsProjectionDispatchAdapterTokenEnvName,
    intervalMs: config.options.intervalMs,
    batchSize: config.options.batchSize,
    timeoutMs: config.options.timeoutMs,
    maxAttempts: config.options.maxAttempts,
    rawAdapterUrlLogged: false as const,
    rawTokenLogged: false as const,
  };
}

function positiveIntEnv(env: LocalServerEnv, envName: string, fallback: number): number {
  const raw = env[envName];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}

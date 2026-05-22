import { resolve } from 'node:path';
import {
  pmsLocalAuthTokenEnvName,
  pmsSqliteDbPathEnvName,
  startPmsLocalHttpServer,
  type PmsLocalSandboxStore,
  type PmsSandboxReservationImportRecord,
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
  reservationStatuses,
  stayStatuses,
  type ReservationStatus,
} from '@pms-platform/contracts';
import type { RoomAggregate } from '@pms-platform/core';

export const pmsLocalHostEnvName = 'PMS_PLATFORM_LOCAL_HOST';
export const pmsLocalPortEnvName = 'PMS_PLATFORM_LOCAL_PORT';
export const pmsLocalAuthRequiredEnvName = 'PMS_PLATFORM_LOCAL_AUTH_REQUIRED';
export const pmsSandboxResetOnStartEnvName = 'PMS_PLATFORM_SANDBOX_RESET_ON_START';
export const pmsSandboxSeedRoomIdEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_ID';
export const pmsSandboxSeedRoomNumberEnvName = 'PMS_PLATFORM_SANDBOX_SEED_ROOM_NUMBER';
export const pmsSandboxSeedReservationsJsonEnvName = 'PMS_PLATFORM_SANDBOX_SEED_RESERVATIONS_JSON';

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
  const seedReservations = createSeedReservationsFromEnv(env);
  const resetOnStart = env[pmsSandboxResetOnStartEnvName] === 'true';

  return createSqliteLocalSandboxStore({
    dbPath: resolve(env[pmsSqliteDbPathEnvName] ?? defaultSqliteDbPath),
    seedRooms,
    seedReservations,
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

function createSeedReservationsFromEnv(env: LocalServerEnv = process.env): readonly PmsSandboxReservationImportRecord[] {
  const raw = env[pmsSandboxSeedReservationsJsonEnvName];
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${pmsSandboxSeedReservationsJsonEnvName} must be valid JSON`);
  }
  const records = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.reservations)
      ? parsed.reservations
      : undefined;
  if (!records) {
    throw new Error(`${pmsSandboxSeedReservationsJsonEnvName} must be a JSON array or {"reservations":[]}`);
  }
  return records.map(parseSeedReservationRecord);
}

function parseSeedReservationRecord(value: unknown, index: number): PmsSandboxReservationImportRecord {
  if (!isRecord(value)) {
    throw new Error(`${pmsSandboxSeedReservationsJsonEnvName}[${index}] must be an object`);
  }
  const status = parseReservationStatus(value.status, index);
  return {
    reservationId: requiredString(value, 'reservationId', index),
    reservationCode: requiredString(value, 'reservationCode', index),
    propertyId: requiredString(value, 'propertyId', index),
    ...optionalString(value, 'roomId'),
    ...optionalString(value, 'roomNumber'),
    ...optionalString(value, 'roomTypeId'),
    ...optionalString(value, 'roomType'),
    guestDisplayName: requiredString(value, 'guestDisplayName', index),
    arrivalDate: requiredString(value, 'arrivalDate', index),
    departureDate: requiredString(value, 'departureDate', index),
    status,
    ...parseSeedReservationAllocation(value.allocation),
    ...parseSeedReservationStay(value.stay),
  };
}

function parseSeedReservationAllocation(value: unknown): Pick<PmsSandboxReservationImportRecord, 'allocation'> | Record<string, never> {
  if (!isRecord(value)) return {};
  return {
    allocation: {
      ...optionalString(value, 'allocationId'),
      ...optionalString(value, 'roomId'),
      ...optionalString(value, 'roomNumber'),
      ...optionalString(value, 'roomTypeId'),
      ...optionalString(value, 'roomType'),
      ...optionalString(value, 'startDate'),
      ...optionalString(value, 'endDate'),
      ...optionalString(value, 'status'),
    },
  };
}

function parseSeedReservationStay(value: unknown): Pick<PmsSandboxReservationImportRecord, 'stay'> | Record<string, never> {
  if (!isRecord(value)) return {};
  return {
    stay: {
      ...optionalString(value, 'stayId'),
      ...optionalString(value, 'roomId'),
      ...optionalString(value, 'roomNumber'),
      ...optionalString(value, 'checkedInAt'),
      ...optionalString(value, 'checkedOutAt'),
      ...optionalStayStatus(value.status),
    },
  };
}

function parseReservationStatus(value: unknown, index: number): ReservationStatus {
  const status = typeof value === 'string'
    ? reservationStatuses.find((item) => item === value)
    : undefined;
  if (!status) {
    throw new Error(`${pmsSandboxSeedReservationsJsonEnvName}[${index}].status must be a reservation status`);
  }
  return status;
}

function optionalStayStatus(value: unknown): Pick<NonNullable<PmsSandboxReservationImportRecord['stay']>, 'status'> | Record<string, never> {
  const status = typeof value === 'string'
    ? stayStatuses.find((item) => item === value)
    : undefined;
  return status ? { status } : {};
}

function requiredString(record: Record<string, unknown>, key: string, index: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${pmsSandboxSeedReservationsJsonEnvName}[${index}].${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString<TKey extends string>(
  record: Record<string, unknown>,
  key: TKey,
): Record<TKey, string> | Record<string, never> {
  const value = record[key];
  return typeof value === 'string' && value.trim()
    ? { [key]: value.trim() } as Record<TKey, string>
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

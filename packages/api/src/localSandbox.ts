import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AuditEntry, DomainEvent, HousekeepingTask } from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePorts,
  type DomainEventCollector,
  type IdempotencyRepository,
  type RoomAggregate,
  type RoomRepository,
  type HousekeepingTaskRepository,
  type AuditRepository,
} from '@pms-platform/core';
import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executeDashboardApiRequest,
  executeGetRoomApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckOutApiRequest,
  type PmsReadModelApiRequest,
} from './index.js';

export const pmsLocalAuthTokenEnvName = 'PMS_PLATFORM_LOCAL_AUTH_TOKEN';
export const pmsSandboxStatePathEnvName = 'PMS_PLATFORM_SANDBOX_STATE_PATH';
export const pmsSandboxStateVersion = 'pms-checkout-local-sandbox-state-v1';

export interface PmsSandboxStateFile {
  readonly version: typeof pmsSandboxStateVersion;
  readonly rooms: readonly RoomAggregate[];
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly audits: readonly AuditEntry[];
  readonly domainEvents: readonly DomainEvent[];
  readonly coreIdempotency: readonly CoreIdempotencyStateRecord[];
  readonly apiIdempotency: readonly ApiIdempotencyRecord[];
  readonly updatedAt: string;
}

export interface CoreIdempotencyStateRecord {
  readonly idempotencyKey: string;
  readonly response: CoreCheckInConfirmResult | CoreCheckOutConfirmResult;
}

export interface CreateDurableLocalSandboxStoreOptions {
  readonly statePath: string;
  readonly seedRooms?: readonly RoomAggregate[];
  readonly resetOnStart?: boolean;
  readonly now?: () => string;
}

export interface PmsSandboxReadback {
  readonly ok: true;
  readonly service: 'pms-platform';
  readonly stateVersion: typeof pmsSandboxStateVersion;
  readonly generatedAt: string;
  readonly storage: {
    readonly kind: 'file';
    readonly envName: typeof pmsSandboxStatePathEnvName;
  };
  readonly filter: {
    readonly roomId?: string;
  };
  readonly rooms: readonly RoomAggregate[];
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly audits: readonly AuditEntry[];
  readonly domainEvents: readonly DomainEvent[];
  readonly idempotencyRecords: readonly PmsSandboxIdempotencyReadback[];
}

export interface PmsSandboxIdempotencyReadback {
  readonly operation: typeof pmsCheckInOperation | typeof pmsCheckOutOperation | 'unknown';
  readonly mode: CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | 'unknown';
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly ok: boolean;
}

export class DurableLocalSandboxStore {
  readonly statePath: string;
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;
  private state: MutableSandboxState;
  private readonly seedRooms: readonly RoomAggregate[];
  private readonly now: () => string;

  constructor(options: CreateDurableLocalSandboxStoreOptions) {
    this.statePath = options.statePath;
    this.seedRooms = cloneValue(options.seedRooms ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
    this.state = options.resetOnStart ? this.createInitialState(this.seedRooms) : this.loadOrCreateState(this.seedRooms);
    this.persist();
    this.ports = this.createCorePorts();
    this.apiIdempotency = this.createApiIdempotencyRepository();
  }

  readback(roomId?: string): PmsSandboxReadback {
    const rooms = roomId ? this.state.rooms.filter((room) => room.roomId === roomId) : this.state.rooms;
    const roomIds = new Set(rooms.map((room) => room.roomId));
    const filterByRoom = roomId ? <T extends { readonly roomId: string }>(items: readonly T[]) => items.filter((item) => roomIds.has(item.roomId)) : <T>(items: readonly T[]) => [...items];
    const filteredTasks = filterByRoom(this.state.housekeepingTasks);
    const filteredAudits = filterByRoom(this.state.audits);
    const filteredEvents = roomId
      ? this.state.domainEvents.filter((event) => eventHasRoom(event, roomIds))
      : this.state.domainEvents;

    return {
      ok: true,
      service: 'pms-platform',
      stateVersion: pmsSandboxStateVersion,
      generatedAt: this.now(),
      storage: {
        kind: 'file',
        envName: pmsSandboxStatePathEnvName,
      },
      filter: roomId ? { roomId } : {},
      rooms: cloneValue(rooms),
      housekeepingTasks: cloneValue(filteredTasks),
      audits: cloneValue(filteredAudits),
      domainEvents: cloneValue(filteredEvents),
      idempotencyRecords: this.state.apiIdempotency.map((record) => ({
        operation: requestOperationFromRecord(record),
        mode: requestModeFromRecord(record),
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        ok: record.response.ok,
      })),
    };
  }

  reset(seedRooms: readonly RoomAggregate[] = this.seedRooms): PmsSandboxReadback {
    this.state = this.createInitialState(seedRooms);
    this.persist();
    return this.readback();
  }

  private loadOrCreateState(seedRooms: readonly RoomAggregate[]): MutableSandboxState {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as PmsSandboxStateFile;
      if (parsed.version !== pmsSandboxStateVersion) {
        throw new Error(`unsupported sandbox state version ${String(parsed.version)}`);
      }
      return mutableState(parsed);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return this.createInitialState(seedRooms);
      }
      throw error;
    }
  }

  private createInitialState(seedRooms: readonly RoomAggregate[]): MutableSandboxState {
    return {
      version: pmsSandboxStateVersion,
      rooms: cloneArray(seedRooms),
      housekeepingTasks: [],
      audits: [],
      domainEvents: [],
      coreIdempotency: [],
      apiIdempotency: [],
      updatedAt: this.now(),
    };
  }

  private persist(): void {
    this.state.updatedAt = this.now();
    mkdirSync(dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    renameSync(tempPath, this.statePath);
  }

  private createCorePorts(): CorePorts {
    return {
      rooms: this.createRoomRepository(),
      housekeepingTasks: this.createHousekeepingTaskRepository(),
      audits: this.createAuditRepository(),
      idempotency: this.createCoreIdempotencyRepository(),
      events: this.createDomainEventCollector(),
    };
  }

  private createRoomRepository(): RoomRepository {
    return {
      get: (roomId) => cloneValue(this.state.rooms.find((room) => room.roomId === roomId)),
      save: (room) => {
        const next = cloneValue(room);
        const index = this.state.rooms.findIndex((entry) => entry.roomId === next.roomId);
        if (index >= 0) {
          this.state.rooms[index] = next;
        } else {
          this.state.rooms.push(next);
        }
        this.persist();
      },
      list: () => cloneValue(this.state.rooms),
    };
  }

  private createHousekeepingTaskRepository(): HousekeepingTaskRepository {
    return {
      get: (taskId) => cloneValue(this.state.housekeepingTasks.find((task) => task.taskId === taskId)),
      save: (task) => {
        const next = cloneValue(task);
        const index = this.state.housekeepingTasks.findIndex((entry) => entry.taskId === next.taskId);
        if (index >= 0) {
          this.state.housekeepingTasks[index] = next;
        } else {
          this.state.housekeepingTasks.push(next);
        }
        this.persist();
      },
      list: () => cloneValue(this.state.housekeepingTasks),
    };
  }

  private createAuditRepository(): AuditRepository {
    return {
      append: (entry) => {
        this.state.audits.push(cloneValue(entry));
        this.persist();
      },
      list: () => cloneValue(this.state.audits),
    };
  }

  private createCoreIdempotencyRepository(): IdempotencyRepository<CoreCheckInConfirmResult | CoreCheckOutConfirmResult> {
    return {
      get: (idempotencyKey) => cloneValue(this.state.coreIdempotency.find((entry) => entry.idempotencyKey === idempotencyKey)?.response),
      save: (idempotencyKey, response) => {
        const next = { idempotencyKey, response: cloneValue(response) };
        const index = this.state.coreIdempotency.findIndex((entry) => entry.idempotencyKey === idempotencyKey);
        if (index >= 0) {
          this.state.coreIdempotency[index] = next;
        } else {
          this.state.coreIdempotency.push(next);
        }
        this.persist();
      },
      has: (idempotencyKey) => this.state.coreIdempotency.some((entry) => entry.idempotencyKey === idempotencyKey),
    };
  }

  private createDomainEventCollector(): DomainEventCollector {
    return {
      append: (event) => {
        this.state.domainEvents.push(cloneValue(event));
        this.persist();
      },
      list: () => cloneValue(this.state.domainEvents),
      clear: () => {
        this.state.domainEvents = [];
        this.persist();
      },
    };
  }

  private createApiIdempotencyRepository(): ApiIdempotencyRepository {
    return {
      get: (idempotencyKey) => cloneValue(this.state.apiIdempotency.find((entry) => entry.idempotencyKey === idempotencyKey)),
      save: (record) => {
        const next = cloneValue(record);
        const index = this.state.apiIdempotency.findIndex((entry) => entry.idempotencyKey === next.idempotencyKey);
        if (index >= 0) {
          this.state.apiIdempotency[index] = next;
        } else {
          this.state.apiIdempotency.push(next);
        }
        this.persist();
      },
      list: () => cloneValue(this.state.apiIdempotency),
    };
  }
}

export interface PmsLocalAuthConfig {
  readonly envName?: typeof pmsLocalAuthTokenEnvName | string;
  readonly token?: string;
  readonly required?: boolean;
}

export interface PmsLocalHttpHandlerOptions {
  readonly store: DurableLocalSandboxStore;
  readonly auth?: PmsLocalAuthConfig;
}

export interface PmsLocalHttpServerOptions extends PmsLocalHttpHandlerOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface StartedPmsLocalHttpServer {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}

export function createDurableLocalSandboxStore(options: CreateDurableLocalSandboxStoreOptions): DurableLocalSandboxStore {
  return new DurableLocalSandboxStore(options);
}

export function createPmsLocalHttpHandler(options: PmsLocalHttpHandlerOptions) {
  const auth = resolveAuth(options.auth);

  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (request.method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, {
          ok: true,
          service: 'pms-platform',
          boundary: 'pms-checkout-local-sandbox',
          operation: pmsCheckOutOperation,
          operations: [pmsCheckInOperation, pmsCheckOutOperation, pmsGetRoomOperation, pmsDashboardOperation],
          storage: {
            kind: 'file',
            envName: pmsSandboxStatePathEnvName,
          },
          auth: {
            type: 'bearer-token',
            envName: auth.envName,
            configured: Boolean(auth.token),
            required: auth.required,
          },
        });
        return;
      }

      const authResult = checkAuth(request, auth);
      if (!authResult.ok) {
        writeJson(response, authResult.status, {
          ok: false,
          error: authResult.error,
          auth: {
            envName: auth.envName,
            required: auth.required,
          },
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/check-in') {
        const body = await readJsonBody(request);
        const result = executeCheckInApiRequest(body as CheckInApiRequest, options.store.ports, {
          idempotency: options.store.apiIdempotency,
        });
        writeJson(response, result.ok ? 200 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/check-out') {
        const body = await readJsonBody(request);
        const result = executeCheckOutApiRequest(body as CheckOutApiRequest, options.store.ports, {
          idempotency: options.store.apiIdempotency,
        });
        writeJson(response, result.ok ? 200 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/room') {
        const body = await readJsonBody(request);
        const result = executeGetRoomApiRequest(body as PmsReadModelApiRequest & { operation: typeof pmsGetRoomOperation }, options.store.ports);
        writeJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/dashboard') {
        const body = await readJsonBody(request);
        const result = executeDashboardApiRequest(body as PmsReadModelApiRequest & { operation: typeof pmsDashboardOperation }, options.store.ports);
        writeJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/v1/sandbox/readback')) {
        const roomIdFromPath = url.pathname.startsWith('/v1/sandbox/readback/')
          ? decodeURIComponent(url.pathname.slice('/v1/sandbox/readback/'.length))
          : undefined;
        const roomId = url.searchParams.get('roomId') ?? roomIdFromPath;
        writeJson(response, 200, options.store.readback(roomId || undefined));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sandbox/reset') {
        const body = await readJsonBody(request, true);
        const rooms = Array.isArray((body as { rooms?: unknown }).rooms)
          ? ((body as { rooms: readonly RoomAggregate[] }).rooms)
          : undefined;
        writeJson(response, 200, options.store.reset(rooms));
        return;
      }

      writeJson(response, 404, {
        ok: false,
        error: {
          code: 'PMS_LOCAL_ROUTE_NOT_FOUND',
          message: `No PMS local sandbox route for ${request.method ?? 'UNKNOWN'} ${url.pathname}`,
        },
      });
    } catch (error) {
      writeJson(response, 500, {
        ok: false,
        error: {
          code: 'PMS_LOCAL_SANDBOX_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}

export async function startPmsLocalHttpServer(options: PmsLocalHttpServerOptions): Promise<StartedPmsLocalHttpServer> {
  const server = createServer(createPmsLocalHttpHandler(options));
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://${address.address}:${address.port}`;

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function resolveAuth(auth: PmsLocalAuthConfig | undefined) {
  const envName = auth?.envName ?? pmsLocalAuthTokenEnvName;
  const token = auth?.token ?? process.env[envName];
  return {
    envName,
    token,
    required: auth?.required ?? Boolean(token),
  };
}

function checkAuth(request: IncomingMessage, auth: ReturnType<typeof resolveAuth>) {
  if (!auth.required) {
    return { ok: true as const };
  }

  if (!auth.token) {
    return {
      ok: false as const,
      status: 503,
      error: {
        code: 'PMS_LOCAL_AUTH_NOT_CONFIGURED',
        message: `Local PMS auth is required but ${auth.envName} is not configured.`,
      },
    };
  }

  const authorization = request.headers.authorization;
  if (!authorization) {
    return {
      ok: false as const,
      status: 401,
      error: {
        code: 'PMS_LOCAL_AUTH_REQUIRED',
        message: 'Bearer auth is required for PMS local sandbox calls.',
      },
    };
  }

  if (authorization !== `Bearer ${auth.token}`) {
    return {
      ok: false as const,
      status: 403,
      error: {
        code: 'PMS_LOCAL_AUTH_DENIED',
        message: 'Bearer auth token did not match the configured PMS local sandbox token.',
      },
    };
  }

  return { ok: true as const };
}

function readJsonBody(request: IncomingMessage, allowEmpty = false): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw && allowEmpty) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON request body: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function mutableState(state: PmsSandboxStateFile): MutableSandboxState {
  return {
    version: state.version,
    rooms: cloneArray(state.rooms),
    housekeepingTasks: cloneArray(state.housekeepingTasks),
    audits: cloneArray(state.audits),
    domainEvents: cloneArray(state.domainEvents),
    coreIdempotency: cloneArray(state.coreIdempotency),
    apiIdempotency: cloneArray(state.apiIdempotency),
    updatedAt: state.updatedAt,
  };
}

function requestModeFromRecord(record: ApiIdempotencyRecord): CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | 'unknown' {
  return record.response.ok ? record.response.mode : record.response.mode === 'dryRun' || record.response.mode === 'confirm' ? record.response.mode : 'unknown';
}

function requestOperationFromRecord(record: ApiIdempotencyRecord): PmsSandboxIdempotencyReadback['operation'] {
  return record.response.ok && (record.response.operation === pmsCheckInOperation || record.response.operation === pmsCheckOutOperation)
    ? record.response.operation
    : 'unknown';
}

function eventHasRoom(event: DomainEvent, roomIds: ReadonlySet<string>): boolean {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return roomIds.has(event.roomId);
  }
  return roomIds.has(event.task.roomId);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function cloneArray<TValue>(values: readonly TValue[]): TValue[] {
  return values.map((value) => cloneValue(value));
}

function cloneValue<TValue>(value: TValue): TValue {
  if (value === undefined) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

interface MutableSandboxState {
  version: typeof pmsSandboxStateVersion;
  rooms: RoomAggregate[];
  housekeepingTasks: HousekeepingTask[];
  audits: AuditEntry[];
  domainEvents: DomainEvent[];
  coreIdempotency: CoreIdempotencyStateRecord[];
  apiIdempotency: ApiIdempotencyRecord[];
  updatedAt: string;
}

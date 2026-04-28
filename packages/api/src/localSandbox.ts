import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AuditEntry, DomainEvent, HousekeepingTask } from '@pms-platform/contracts';
import {
  type CorePorts,
  type RoomAggregate,
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
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckOutApiRequest,
  type PmsReadModelApiRequest,
} from './index.js';

export const pmsLocalAuthTokenEnvName = 'PMS_PLATFORM_LOCAL_AUTH_TOKEN';
export const pmsSqliteDbPathEnvName = 'PMS_PLATFORM_SQLITE_DB_PATH';
export const pmsSandboxStateVersion = 'pms-checkout-local-sandbox-state-v1';

export type PmsLocalStorageKind = 'sqlite';

export interface PmsLocalStorageMetadata {
  readonly kind: PmsLocalStorageKind;
  readonly envName: string;
  readonly driver?: string;
  readonly experimental?: boolean;
}

export interface PmsSandboxReadback {
  readonly ok: true;
  readonly service: 'pms-platform';
  readonly stateVersion: typeof pmsSandboxStateVersion;
  readonly generatedAt: string;
  readonly storage: PmsLocalStorageMetadata;
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

export interface PmsLocalSandboxStore {
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;
  readonly storage: PmsLocalStorageMetadata;
  readback(roomId?: string): PmsSandboxReadback;
  reset(seedRooms?: readonly RoomAggregate[]): PmsSandboxReadback;
  runInTransaction?<TValue>(operation: () => TValue): TValue;
  close?(): void;
}

export interface PmsLocalAuthConfig {
  readonly envName?: typeof pmsLocalAuthTokenEnvName | string;
  readonly token?: string;
  readonly required?: boolean;
}

export interface PmsLocalHttpHandlerOptions {
  readonly store: PmsLocalSandboxStore;
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
          storage: options.store.storage,
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
        const result = executeWithStoreTransaction(options.store, () =>
          executeCheckInApiRequest(body as CheckInApiRequest, options.store.ports, {
            idempotency: options.store.apiIdempotency,
          }),
        );
        writeJson(response, result.ok ? 200 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/check-out') {
        const body = await readJsonBody(request);
        const result = executeWithStoreTransaction(options.store, () =>
          executeCheckOutApiRequest(body as CheckOutApiRequest, options.store.ports, {
            idempotency: options.store.apiIdempotency,
          }),
        );
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
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          try {
            options.store.close?.();
            resolve();
          } catch (closeError) {
            reject(closeError);
          }
        });
      }),
  };
}

function executeWithStoreTransaction<TValue>(store: PmsLocalSandboxStore, operation: () => TValue): TValue {
  return store.runInTransaction ? store.runInTransaction(operation) : operation();
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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  AuditEntry,
  DomainEvent,
  HousekeepingTask,
  InventoryBlock,
  InventoryDayRoom,
  InventoryHorizonRequest,
  InventoryIntervalProjection,
  InventoryReadModel,
  InventorySummaryDayType,
  MaintenanceTicket,
  OperationRequest,
  ReservationReadModel,
  RoomReservationContextReadModel,
  StayReadModel,
  StayStatus,
  TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePorts,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executeAvailabilitySearchApiRequest,
  executeDashboardApiRequest,
  executeGetRoomApiRequest,
  executePmsExtendedCommandApiRequest,
  executeReservationDraftWorkflowApiRequest,
  getPmsCapabilityManifest,
  pmsAvailabilitySearchOperation,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsMaintenanceDoneOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReservationGetOperation,
  pmsReportMaintenanceOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsRoomReservationContextOperation,
  pmsRestoreSellableOperation,
  pmsTodayArrivalsOperation,
  pmsTodayDeparturesOperation,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckInConfirmApiRequest,
  type CheckOutApiRequest,
  type CheckOutConfirmApiRequest,
  type OperationRequestCreateApiRequest,
  type OperationRequestCreateApiResponse,
  type OperationRequestGetApiRequest,
  type OperationRequestGetApiResponse,
  type OperationRequestListApiRequest,
  type OperationRequestListApiResponse,
  type OperationRequestUpdateApiRequest,
  type OperationRequestUpdateApiResponse,
  type PendingActionCancelApiRequest,
  type PendingActionCallbackApiResponse,
  type PendingActionConfirmApiRequest,
  type PendingActionStatusApiRequest,
  type PmsExtendedCommandApiRequest,
  type ReservationDraftLifecycleStore,
  type ReservationDraftWorkflowApiRequest,
  type PmsReadModelApiRequest,
} from './index.js';

export const pmsLocalAuthTokenEnvName = 'PMS_PLATFORM_LOCAL_AUTH_TOKEN';
export const pmsSqliteDbPathEnvName = 'PMS_PLATFORM_SQLITE_DB_PATH';
export const pmsSandboxStateVersion = 'pms-checkout-local-sandbox-state-v1';

export type PmsLocalStorageKind = 'sqlite';

export interface PmsSandboxPropertyReadback {
  readonly propertyId: string;
  readonly propertyCode: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly status: string;
}

export interface PmsSandboxRoomTypeReadback {
  readonly roomTypeId: string;
  readonly propertyId: string;
  readonly roomTypeCode: string;
  readonly displayName: string;
  readonly sortKey: string;
  readonly status: string;
}

export interface PmsSandboxReservationAllocationReadback {
  readonly allocationId: string;
  readonly reservationId: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
}

export interface PmsSandboxStayReadback extends Omit<StayReadModel, 'projectionFreshness'> {}

export interface PmsSandboxReservationImportRecord {
  readonly reservationId: string;
  readonly reservationCode: string;
  readonly propertyId: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly guestDisplayName: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly status: ReservationReadModel['status'];
  readonly allocation?: {
    readonly allocationId?: string;
    readonly roomId?: string;
    readonly roomNumber?: string;
    readonly roomTypeId?: string;
    readonly roomType?: string;
    readonly startDate?: string;
    readonly endDate?: string;
    readonly status?: string;
  };
  readonly stay?: {
    readonly stayId?: string;
    readonly roomId?: string;
    readonly roomNumber?: string;
    readonly checkedInAt?: string;
    readonly checkedOutAt?: string;
    readonly status?: StayStatus;
  };
}

export interface PmsSandboxReservationImportResult {
  readonly importedCount: number;
  readonly reservations: readonly ReservationReadModel[];
}

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
  readonly properties: readonly PmsSandboxPropertyReadback[];
  readonly roomTypes: readonly PmsSandboxRoomTypeReadback[];
  readonly rooms: readonly RoomAggregate[];
  readonly reservations: readonly ReservationReadModel[];
  readonly reservationAllocations: readonly PmsSandboxReservationAllocationReadback[];
  readonly stays: readonly PmsSandboxStayReadback[];
  readonly inventoryBlocks: readonly InventoryBlock[];
  readonly inventoryDayRooms: readonly InventoryDayRoom[];
  readonly inventoryIntervalProjection: readonly InventoryIntervalProjection[];
  readonly inventorySummaryDayType: readonly InventorySummaryDayType[];
  readonly reservationDrafts: readonly import('@pms-platform/contracts').ReservationDraftWorkflowRef[];
  readonly reservationDraftAudits: readonly import('@pms-platform/contracts').ReservationDraftAuditRef[];
  readonly operationRequests: readonly OperationRequest[];
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly maintenanceTickets: readonly MaintenanceTicket[];
  readonly audits: readonly AuditEntry[];
  readonly domainEvents: readonly DomainEvent[];
  readonly idempotencyRecords: readonly PmsSandboxIdempotencyReadback[];
}

export interface PmsSandboxIdempotencyReadback {
  readonly operation: typeof pmsCheckInOperation | typeof pmsCheckOutOperation | PmsExtendedCommandApiRequest['operation'] | ReservationDraftWorkflowApiRequest['operation'] | typeof pmsPendingActionStatusOperation | typeof pmsPendingActionConfirmOperation | typeof pmsPendingActionCancelOperation | 'unknown';
  readonly mode: CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | PmsExtendedCommandApiRequest['mode'] | 'draft' | 'unknown';
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly ok: boolean;
}

export interface PmsLocalSandboxStore extends ReservationDraftLifecycleStore {
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;
  readonly storage: PmsLocalStorageMetadata;
  readback(roomId?: string): PmsSandboxReadback;
  reset(seedRooms?: readonly RoomAggregate[], seedReservations?: readonly PmsSandboxReservationImportRecord[]): PmsSandboxReadback;
  importReservations(reservations: readonly PmsSandboxReservationImportRecord[]): PmsSandboxReservationImportResult;
  getReservation(reservationCode: string, requestedAt: string): ReservationReadModel | undefined;
  todayArrivals(businessDate: string, requestedAt: string): TodayReservationsReadModel;
  todayDepartures(businessDate: string, requestedAt: string): TodayReservationsReadModel;
  roomReservationContext(roomId: string, requestedAt: string): RoomReservationContextReadModel;
  rebuildInventory(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  inventoryIntervals(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  inventorySummary(options?: Partial<InventoryHorizonRequest>): InventoryReadModel;
  createOperationRequest(request: OperationRequestCreateApiRequest): OperationRequestCreateApiResponse;
  getOperationRequest(request: OperationRequestGetApiRequest): OperationRequestGetApiResponse;
  listOperationRequests(request: OperationRequestListApiRequest): OperationRequestListApiResponse;
  updateOperationRequest(request: OperationRequestUpdateApiRequest): OperationRequestUpdateApiResponse;
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse;
  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse;
  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse;
  recordCheckInStay?(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined;
  recordCheckOutStay?(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined;
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
          operations: [
            pmsCheckInOperation,
            pmsCheckOutOperation,
            pmsHousekeepingDoneOperation,
            pmsHousekeepingInspectionOperation,
            pmsHousekeepingReworkOperation,
            pmsReportMaintenanceOperation,
            pmsMaintenanceDoneOperation,
            pmsRestoreSellableOperation,
            pmsGetRoomOperation,
            pmsDashboardOperation,
            pmsReservationGetOperation,
            pmsTodayArrivalsOperation,
            pmsTodayDeparturesOperation,
            pmsRoomReservationContextOperation,
            pmsInventoryIntervalsOperation,
            pmsInventorySummaryOperation,
            pmsAvailabilitySearchOperation,
            pmsReservationDraftCreateOperation,
            pmsReservationDraftUpdateOperation,
            pmsReservationQuoteOperation,
            pmsReservationPrepareConfirmOperation,
            pmsReservationDraftCancelOperation,
            pmsOperationRequestCreateOperation,
            pmsOperationRequestGetOperation,
            pmsOperationRequestListOperation,
            pmsOperationRequestUpdateOperation,
            pmsPendingActionStatusOperation,
            pmsPendingActionConfirmOperation,
            pmsPendingActionCancelOperation,
            pmsCapabilityManifestOperation,
          ],
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

      if (request.method === 'GET' && url.pathname === '/v1/pms/capabilities/manifest') {
        writeJson(response, 200, {
          ok: true,
          operation: pmsCapabilityManifestOperation,
          manifest: getPmsCapabilityManifest(),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/check-in') {
        const body = await readJsonBody(request);
        const result = executeWithStoreTransaction(options.store, () =>
          executeCheckInApiRequest(body as CheckInApiRequest, options.store.ports, {
            idempotency: options.store.apiIdempotency,
            stayLifecycle: {
              afterCheckInConfirm: ({ request, result }) => options.store.recordCheckInStay?.(request, result),
            },
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
            stayLifecycle: {
              afterCheckOutConfirm: ({ request, result }) => options.store.recordCheckOutStay?.(request, result),
            },
          }),
        );
        writeJson(response, result.ok ? 200 : 400, result);
        return;
      }

      const extendedCommandRoute = extendedCommandOperationForPath(url.pathname);
      if (request.method === 'POST' && extendedCommandRoute) {
        const body = await readJsonBody(request);
        const commandRequest = { ...(body as Record<string, unknown>), operation: extendedCommandRoute } as PmsExtendedCommandApiRequest;
        const result = executeWithStoreTransaction(options.store, () =>
          executePmsExtendedCommandApiRequest(commandRequest, options.store.ports, {
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

      if (request.method === 'POST' && url.pathname === '/v1/pms/reservations/get') {
        const body = await readJsonBody(request) as { reservationCode?: string; requestedAt?: string };
        const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
        writeJson(response, 200, {
          ok: true,
          operation: pmsReservationGetOperation,
          readModel: typeof body.reservationCode === 'string'
            ? options.store.getReservation(body.reservationCode, requestedAt)
            : undefined,
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/reservations/today-arrivals') {
        const body = await readJsonBody(request) as { businessDate?: string; requestedAt?: string };
        const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
        const businessDate = typeof body.businessDate === 'string' ? body.businessDate : requestedAt.slice(0, 10);
        writeJson(response, 200, {
          ok: true,
          operation: pmsTodayArrivalsOperation,
          readModel: options.store.todayArrivals(businessDate, requestedAt),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/reservations/today-departures') {
        const body = await readJsonBody(request) as { businessDate?: string; requestedAt?: string };
        const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
        const businessDate = typeof body.businessDate === 'string' ? body.businessDate : requestedAt.slice(0, 10);
        writeJson(response, 200, {
          ok: true,
          operation: pmsTodayDeparturesOperation,
          readModel: options.store.todayDepartures(businessDate, requestedAt),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/room/reservation-context') {
        const body = await readJsonBody(request) as { roomId?: string; requestedAt?: string };
        const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
        writeJson(response, 200, {
          ok: true,
          operation: pmsRoomReservationContextOperation,
          readModel: options.store.roomReservationContext(String(body.roomId ?? ''), requestedAt),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/inventory/intervals') {
        const body = await readJsonBody(request) as Partial<InventoryHorizonRequest>;
        writeJson(response, 200, {
          ok: true,
          operation: pmsInventoryIntervalsOperation,
          readModel: options.store.inventoryIntervals(body),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/inventory/summary') {
        const body = await readJsonBody(request) as Partial<InventoryHorizonRequest>;
        writeJson(response, 200, {
          ok: true,
          operation: pmsInventorySummaryOperation,
          readModel: options.store.inventorySummary(body),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/availability/search') {
        const body = await readJsonBody(request) as { startDate?: string; endDate?: string; horizonDays?: number };
        const startDate = typeof body.startDate === 'string' ? body.startDate : new Date().toISOString().slice(0, 10);
        const horizonDays = typeof body.horizonDays === 'number'
          ? body.horizonDays
          : typeof body.endDate === 'string'
            ? Math.max(1, businessDateDiff(startDate, body.endDate))
            : 1;
        const inventory = options.store.inventoryIntervals({ startDate, horizonDays });
        writeJson(response, 200, executeAvailabilitySearchApiRequest({
          ...(body as Record<string, unknown>),
          operation: pmsAvailabilitySearchOperation,
          startDate,
          requestedAt: typeof (body as { requestedAt?: unknown }).requestedAt === 'string'
            ? (body as { requestedAt: string }).requestedAt
            : new Date().toISOString(),
        }, inventory));
        return;
      }

      const reservationDraftRoute = reservationDraftOperationForPath(url.pathname);
      if (request.method === 'POST' && reservationDraftRoute) {
        const body = await readJsonBody(request);
        const result = executeWithStoreTransaction(options.store, () => executeReservationDraftWorkflowApiRequest({
          ...(body as Record<string, unknown>),
          operation: reservationDraftRoute,
        } as ReservationDraftWorkflowApiRequest, { drafts: options.store }));
        writeJson(response, result.ok ? 200 : result.status === 'notImplemented' ? 501 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/create') {
        const body = await readJsonBody(request) as OperationRequestCreateApiRequest;
        const result = options.store.createOperationRequest({ ...body, operation: pmsOperationRequestCreateOperation });
        writeJson(response, result.ok ? 200 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/get') {
        const body = await readJsonBody(request) as OperationRequestGetApiRequest;
        writeJson(response, 200, options.store.getOperationRequest({ ...body, operation: pmsOperationRequestGetOperation }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/list') {
        const body = await readJsonBody(request, true) as OperationRequestListApiRequest;
        writeJson(response, 200, options.store.listOperationRequests({ ...body, operation: pmsOperationRequestListOperation }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/update') {
        const body = await readJsonBody(request) as OperationRequestUpdateApiRequest;
        const result = options.store.updateOperationRequest({ ...body, operation: pmsOperationRequestUpdateOperation });
        writeJson(response, result.ok ? 200 : 404, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/status') {
        const body = await readJsonBody(request) as PendingActionStatusApiRequest;
        const result = options.store.getPendingActionStatus({ ...body, operation: pmsPendingActionStatusOperation });
        writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/confirm') {
        const body = await readJsonBody(request) as PendingActionConfirmApiRequest;
        const result = options.store.confirmPendingAction({ ...body, operation: pmsPendingActionConfirmOperation });
        writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/cancel') {
        const body = await readJsonBody(request) as PendingActionCancelApiRequest;
        const result = options.store.cancelPendingAction({ ...body, operation: pmsPendingActionCancelOperation });
        writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/sandbox/reservations/import') {
        const body = await readJsonBody(request, true) as { reservations?: readonly PmsSandboxReservationImportRecord[] };
        const reservations = Array.isArray(body.reservations) ? body.reservations : [];
        writeJson(response, 200, {
          ok: true,
          operation: 'sandbox_reservations_import',
          result: options.store.importReservations(reservations),
        });
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
        const reservations = Array.isArray((body as { reservations?: unknown }).reservations)
          ? ((body as { reservations: readonly PmsSandboxReservationImportRecord[] }).reservations)
          : undefined;
        writeJson(response, 200, options.store.reset(rooms, reservations));
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

function reservationDraftOperationForPath(pathname: string): ReservationDraftWorkflowApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/reservation-drafts/create') return pmsReservationDraftCreateOperation;
  if (pathname === '/v1/pms/reservation-drafts/update') return pmsReservationDraftUpdateOperation;
  if (pathname === '/v1/pms/reservation-drafts/quote') return pmsReservationQuoteOperation;
  if (pathname === '/v1/pms/reservation-drafts/prepare-confirm') return pmsReservationPrepareConfirmOperation;
  if (pathname === '/v1/pms/reservation-drafts/cancel') return pmsReservationDraftCancelOperation;
  return undefined;
}

function extendedCommandOperationForPath(pathname: string): PmsExtendedCommandApiRequest['operation'] | undefined {
  if (pathname === '/v1/pms/housekeeping/done') return pmsHousekeepingDoneOperation;
  if (pathname === '/v1/pms/housekeeping/inspection') return pmsHousekeepingInspectionOperation;
  if (pathname === '/v1/pms/housekeeping/rework') return pmsHousekeepingReworkOperation;
  if (pathname === '/v1/pms/maintenance/report') return pmsReportMaintenanceOperation;
  if (pathname === '/v1/pms/maintenance/done') return pmsMaintenanceDoneOperation;
  if (pathname === '/v1/pms/maintenance/restore-sellable') return pmsRestoreSellableOperation;
  return undefined;
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

function businessDateDiff(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.ceil((end - start) / 86_400_000);
}

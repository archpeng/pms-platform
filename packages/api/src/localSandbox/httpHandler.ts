import type { InventoryHorizonRequest } from '@pms-platform/contracts';
import type { RoomAggregate } from '@pms-platform/core';
import type { IncomingMessage,ServerResponse } from 'node:http';
import {
executeAvailabilitySearchApiRequest,
executeCheckInApiRequest,
executeCheckOutApiRequest,
executeDashboardApiRequest,
executeGetRoomApiRequest,
executePmsExtendedCommandApiRequest,
executeReservationDraftWorkflowApiRequest,
executeReservationGroupDraftWorkflowApiRequest,
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
pmsReportMaintenanceOperation,
pmsReservationDraftCancelOperation,
pmsReservationDraftCreateOperation,
pmsReservationDraftUpdateOperation,
pmsReservationGetOperation,
pmsReservationGroupDraftCancelOperation,
pmsReservationGroupDraftCreateOperation,
pmsReservationGroupDraftUpdateOperation,
pmsReservationGroupPrepareConfirmOperation,
pmsReservationGroupQuoteOperation,
pmsReservationPrepareConfirmOperation,
pmsReservationQuoteOperation,
pmsRestoreSellableOperation,
pmsRoomReservationContextOperation,
pmsTodayArrivalsOperation,
pmsTodayDeparturesOperation,
type CheckInApiRequest,
type CheckOutApiRequest,
type OperationRequestCreateApiRequest,
type OperationRequestGetApiRequest,
type OperationRequestListApiRequest,
type OperationRequestUpdateApiRequest,
type PendingActionCancelApiRequest,
type PendingActionConfirmApiRequest,
type PendingActionStatusApiRequest,
type PmsExtendedCommandApiRequest,
type PmsReadModelApiRequest,
type ReservationDraftWorkflowApiRequest,
type ReservationGroupDraftWorkflowApiRequest,
} from '../index.js';
import { checkAuth,resolveAuth } from './httpAuth.js';
import { readJsonBody,writeJson } from './httpJson.js';
import {
businessDateDiff,
extendedCommandOperationForPath,
reservationDraftOperationForPath,
reservationGroupDraftOperationForPath,
} from './httpRoutes.js';
import type { PmsLocalHttpHandlerOptions,PmsLocalSandboxStore,PmsSandboxReservationImportRecord } from './model.js';

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
            pmsReservationGroupDraftCreateOperation,
            pmsReservationGroupDraftUpdateOperation,
            pmsReservationGroupQuoteOperation,
            pmsReservationGroupPrepareConfirmOperation,
            pmsReservationGroupDraftCancelOperation,
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
          ...(options.projectionDispatcher ? { projectionDispatcher: options.projectionDispatcher } : {}),
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

      const reservationGroupDraftRoute = reservationGroupDraftOperationForPath(url.pathname);
      if (request.method === 'POST' && reservationGroupDraftRoute) {
        const body = await readJsonBody(request);
        const result = executeWithStoreTransaction(options.store, () => executeReservationGroupDraftWorkflowApiRequest({
          ...(body as Record<string, unknown>),
          operation: reservationGroupDraftRoute,
        } as ReservationGroupDraftWorkflowApiRequest, { groupDrafts: options.store }));
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

function executeWithStoreTransaction<TValue>(store: PmsLocalSandboxStore, operation: () => TValue): TValue {
  return store.runInTransaction ? store.runInTransaction(operation) : operation();
}

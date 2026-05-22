import type { InventoryHorizonRequest } from '@pms-platform/contracts';
import { reservationStatuses } from '@pms-platform/contracts';
import {
  executeAvailabilitySearchApiRequest,
  executeDashboardApiRequest,
  executeGetRoomApiRequest,
  executeHotelProfileApiRequest,
  executeRoomTypeCatalogApiRequest,
  reservationSearchQueryFromApiRequest,
  pmsAvailabilitySearchOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHotelProfileOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsReservationGetOperation,
  pmsReservationSearchOperation,
  pmsRoomReservationContextOperation,
  pmsRoomTypeCatalogOperation,
  pmsTodayArrivalsOperation,
  pmsTodayDeparturesOperation,
  type PmsReadModelApiRequest,
} from '../index.js';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import { businessDateDiff } from './httpRoutes.js';

export async function handleReadRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

  if (request.method === 'POST' && url.pathname === '/v1/pms/room') {
    const body = await readJsonBody(request);
    const result = executeGetRoomApiRequest(body as PmsReadModelApiRequest & { operation: typeof pmsGetRoomOperation }, options.store.ports);
    writeJson(response, 200, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/dashboard') {
    const body = await readJsonBody(request);
    const result = executeDashboardApiRequest(body as PmsReadModelApiRequest & { operation: typeof pmsDashboardOperation }, options.store.ports);
    writeJson(response, 200, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/hotel/profile') {
    const body = await readJsonBody(request) as Record<string, unknown>;
    const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
    writeJson(response, 200, executeHotelProfileApiRequest({
      operation: pmsHotelProfileOperation,
      ...(typeof body.propertyId === 'string' ? { propertyId: body.propertyId } : {}),
      requestedAt,
    }, (propertyId, generatedAt) => options.store.hotelProfile(propertyId, generatedAt)));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/room-types/catalog') {
    const body = await readJsonBody(request) as Record<string, unknown>;
    const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
    writeJson(response, 200, executeRoomTypeCatalogApiRequest({
      operation: pmsRoomTypeCatalogOperation,
      ...(typeof body.propertyId === 'string' ? { propertyId: body.propertyId } : {}),
      requestedAt,
    }, (propertyId, generatedAt) => options.store.roomTypeCatalog(propertyId, generatedAt)));
    return true;
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
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/reservations/search') {
    const body = await readJsonBody(request) as Record<string, unknown>;
    const parsed = parseReservationSearchRequest(body);
    if (!parsed.ok) {
      writeJson(response, 400, {
        ok: false,
        operation: pmsReservationSearchOperation,
        error: { code: 'invalid_reservation_search_request', message: parsed.message },
      });
      return true;
    }
    writeJson(response, 200, {
      ok: true,
      operation: pmsReservationSearchOperation,
      readModel: options.store.searchReservations(
        reservationSearchQueryFromApiRequest(parsed.request),
        parsed.request.requestedAt,
      ),
    });
    return true;
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
    return true;
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
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/room/reservation-context') {
    const body = await readJsonBody(request) as { roomId?: string; requestedAt?: string };
    const requestedAt = typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString();
    writeJson(response, 200, {
      ok: true,
      operation: pmsRoomReservationContextOperation,
      readModel: options.store.roomReservationContext(String(body.roomId ?? ''), requestedAt),
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/inventory/intervals') {
    const body = parseInventoryHorizonRequest(await readJsonBody(request));
    writeJson(response, 200, {
      ok: true,
      operation: pmsInventoryIntervalsOperation,
      readModel: options.store.inventoryIntervals(body),
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/inventory/summary') {
    const body = parseInventoryHorizonRequest(await readJsonBody(request));
    writeJson(response, 200, {
      ok: true,
      operation: pmsInventorySummaryOperation,
      readModel: options.store.inventorySummary(body),
    });
    return true;
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
    return true;
  }

  return false;
}

function parseInventoryHorizonRequest(value: unknown): Partial<InventoryHorizonRequest> {
  const body = isRecord(value) ? value : {};
  return {
    ...(typeof body.startDate === 'string' ? { startDate: body.startDate } : {}),
    ...(typeof body.horizonDays === 'number' ? { horizonDays: body.horizonDays } : {}),
    ...(typeof body.roomId === 'string' ? { roomId: body.roomId } : {}),
  };
}

function parseReservationSearchRequest(body: Record<string, unknown>) {
  const guestDisplayName = typeof body.guestDisplayName === 'string' ? body.guestDisplayName.trim() : '';
  if (guestDisplayName.length < 2) {
    return { ok: false, message: 'guestDisplayName must contain at least 2 non-whitespace characters' } as const;
  }
  const status = typeof body.status === 'string' ? reservationStatuses.find((item) => item === body.status) : undefined;
  if (body.status !== undefined && !status) {
    return { ok: false, message: 'status must be one of booked, checkedIn, checkedOut, cancelled' } as const;
  }
  return {
    ok: true,
    request: {
      operation: pmsReservationSearchOperation,
      guestDisplayName,
      ...(status ? { status } : {}),
      ...(typeof body.arrivalDateFrom === 'string' ? { arrivalDateFrom: body.arrivalDateFrom } : {}),
      ...(typeof body.arrivalDateTo === 'string' ? { arrivalDateTo: body.arrivalDateTo } : {}),
      limit: normalizeReservationSearchLimit(body.limit),
      requestedAt: typeof body.requestedAt === 'string' ? body.requestedAt : new Date().toISOString(),
    },
  } as const;
}

function normalizeReservationSearchLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(20, Math.max(1, Math.trunc(value))) : 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

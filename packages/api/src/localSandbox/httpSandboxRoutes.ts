import type { RoomAggregate } from '@pms-platform/core';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import type { PmsSandboxReservationImportRecord } from './model.js';

export async function handleSandboxRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

  if (request.method === 'POST' && url.pathname === '/v1/sandbox/reservations/import') {
    const body = await readJsonBody(request, true) as { reservations?: readonly PmsSandboxReservationImportRecord[] };
    const reservations = Array.isArray(body.reservations) ? body.reservations : [];
    writeJson(response, 200, {
      ok: true,
      operation: 'sandbox_reservations_import',
      result: options.store.importReservations(reservations),
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/v1/sandbox/readback')) {
    const roomIdFromPath = url.pathname.startsWith('/v1/sandbox/readback/')
      ? decodeURIComponent(url.pathname.slice('/v1/sandbox/readback/'.length))
      : undefined;
    const roomId = url.searchParams.get('roomId') ?? roomIdFromPath;
    writeJson(response, 200, options.store.readback(roomId || undefined));
    return true;
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
    return true;
  }

  return false;
}

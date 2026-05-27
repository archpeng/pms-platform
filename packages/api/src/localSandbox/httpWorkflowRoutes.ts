import {
  executeReservationAdjustWorkflowApiRequest,
  executeReservationCancelWorkflowApiRequest,
  executeReservationCreateWorkflowApiRequest,
  executeReservationDraftWorkflowApiRequest,
  executeReservationGroupDraftWorkflowApiRequest,
  type ReservationAdjustWorkflowApiRequest,
  type ReservationCancelWorkflowApiRequest,
  type ReservationCreateWorkflowApiRequest,
  type ReservationDraftWorkflowApiRequest,
  type ReservationGroupDraftWorkflowApiRequest,
} from '../index.js';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import { reservationAdjustOperationForPath,reservationCancelOperationForPath,reservationCreateOperationForPath,reservationDraftOperationForPath,reservationGroupDraftOperationForPath } from './httpRoutes.js';
import { executeWithStoreTransaction } from './httpTransactions.js';

export async function handleWorkflowRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

  const reservationDraftRoute = reservationDraftOperationForPath(url.pathname);
  if (request.method === 'POST' && reservationDraftRoute) {
    const body = await readJsonBody(request);
    const result = executeWithStoreTransaction(options.store, () => executeReservationDraftWorkflowApiRequest({
      ...(body as Record<string, unknown>),
      operation: reservationDraftRoute,
    } as ReservationDraftWorkflowApiRequest, { drafts: options.store }));
    writeJson(response, result.ok ? 200 : result.status === 'notImplemented' ? 501 : 400, result);
    return true;
  }

  const reservationGroupDraftRoute = reservationGroupDraftOperationForPath(url.pathname);
  if (request.method === 'POST' && reservationGroupDraftRoute) {
    const body = await readJsonBody(request);
    const result = executeWithStoreTransaction(options.store, () => executeReservationGroupDraftWorkflowApiRequest({
      ...(body as Record<string, unknown>),
      operation: reservationGroupDraftRoute,
    } as ReservationGroupDraftWorkflowApiRequest, { groupDrafts: options.store }));
    writeJson(response, result.ok ? 200 : result.status === 'notImplemented' ? 501 : 400, result);
    return true;
  }

  const reservationCancelRoute = reservationCancelOperationForPath(url.pathname);
  if (request.method === 'POST' && reservationCancelRoute) {
    const body = await readJsonBody(request);
    const result = executeWithStoreTransaction(options.store, () => executeReservationCancelWorkflowApiRequest({
      ...(body as Record<string, unknown>),
      operation: reservationCancelRoute,
    } as ReservationCancelWorkflowApiRequest, { cancellations: options.store }));
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  const reservationAdjustRoute = reservationAdjustOperationForPath(url.pathname);
  if (request.method === 'POST' && reservationAdjustRoute) {
    const body = await readJsonBody(request);
    const result = executeWithStoreTransaction(options.store, () => executeReservationAdjustWorkflowApiRequest({
      ...(body as Record<string, unknown>),
      operation: reservationAdjustRoute,
    } as ReservationAdjustWorkflowApiRequest, { adjustments: options.store }));
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  const reservationCreateRoute = reservationCreateOperationForPath(url.pathname);
  if (request.method === 'POST' && reservationCreateRoute) {
    const body = await readJsonBody(request);
    const result = executeWithStoreTransaction(options.store, () => executeReservationCreateWorkflowApiRequest({
      ...(body as Record<string, unknown>),
      operation: reservationCreateRoute,
    } as ReservationCreateWorkflowApiRequest, { creations: options.store }));
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  return false;
}

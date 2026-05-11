import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type PendingActionCancelApiRequest,
  type PendingActionConfirmApiRequest,
  type PendingActionStatusApiRequest,
} from '../index.js';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';

export async function handlePendingActionRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

  if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/status') {
    const body = await readJsonBody(request) as PendingActionStatusApiRequest;
    const result = options.store.getPendingActionStatus({ ...body, operation: pmsPendingActionStatusOperation });
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/confirm') {
    const body = await readJsonBody(request) as PendingActionConfirmApiRequest;
    const result = options.store.confirmPendingAction({ ...body, operation: pmsPendingActionConfirmOperation });
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/pending-actions/cancel') {
    const body = await readJsonBody(request) as PendingActionCancelApiRequest;
    const result = options.store.cancelPendingAction({ ...body, operation: pmsPendingActionCancelOperation });
    writeJson(response, result.ok ? 200 : result.status === 'notFound' ? 404 : 400, result);
    return true;
  }

  return false;
}

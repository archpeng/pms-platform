import {
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  type OperationRequestCreateApiRequest,
  type OperationRequestGetApiRequest,
  type OperationRequestListApiRequest,
  type OperationRequestUpdateApiRequest,
} from '../index.js';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';

export async function handleOperationRequestRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

  if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/create') {
    const body = await readJsonBody(request) as OperationRequestCreateApiRequest;
    const result = options.store.createOperationRequest({ ...body, operation: pmsOperationRequestCreateOperation });
    writeJson(response, result.ok ? 200 : 400, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/get') {
    const body = await readJsonBody(request) as OperationRequestGetApiRequest;
    writeJson(response, 200, options.store.getOperationRequest({ ...body, operation: pmsOperationRequestGetOperation }));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/list') {
    const body = await readJsonBody(request, true) as OperationRequestListApiRequest;
    writeJson(response, 200, options.store.listOperationRequests({ ...body, operation: pmsOperationRequestListOperation }));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/v1/pms/operation-requests/update') {
    const body = await readJsonBody(request) as OperationRequestUpdateApiRequest;
    const result = options.store.updateOperationRequest({ ...body, operation: pmsOperationRequestUpdateOperation });
    writeJson(response, result.ok ? 200 : 404, result);
    return true;
  }

  return false;
}

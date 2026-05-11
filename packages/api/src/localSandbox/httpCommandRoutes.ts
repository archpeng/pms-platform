import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  type CheckInApiRequest,
  type CheckOutApiRequest,
  type PmsExtendedCommandApiRequest,
} from '../index.js';
import { readJsonBody,writeJson } from './httpJson.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import { extendedCommandOperationForPath } from './httpRoutes.js';
import { executeWithStoreTransaction } from './httpTransactions.js';

export async function handleCommandRoutes(context: PmsLocalRouteContext): Promise<boolean> {
  const { request,response,url,options } = context;

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
    return true;
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
    return true;
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
    return true;
  }

  return false;
}

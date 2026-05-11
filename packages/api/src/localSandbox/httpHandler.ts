import type { IncomingMessage,ServerResponse } from 'node:http';
import { checkAuth,resolveAuth } from './httpAuth.js';
import { handleCommandRoutes } from './httpCommandRoutes.js';
import { handleCapabilityManifestRoute,handleHealthRoute } from './httpHealthRoutes.js';
import { writeJson } from './httpJson.js';
import { handleOperationRequestRoutes } from './httpOperationRequestRoutes.js';
import { handlePendingActionRoutes } from './httpPendingActionRoutes.js';
import { handleReadRoutes } from './httpReadRoutes.js';
import type { PmsLocalRouteContext } from './httpRouteTypes.js';
import { handleSandboxRoutes } from './httpSandboxRoutes.js';
import { handleWorkflowRoutes } from './httpWorkflowRoutes.js';
import type { PmsLocalHttpHandlerOptions } from './model.js';

export function createPmsLocalHttpHandler(options: PmsLocalHttpHandlerOptions) {
  const auth = resolveAuth(options.auth);

  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const context: PmsLocalRouteContext = { request, response, url, options };

      if (handleHealthRoute(context, auth)) return;

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

      if (handleCapabilityManifestRoute(context)) return;
      if (await handleCommandRoutes(context)) return;
      if (await handleReadRoutes(context)) return;
      if (await handleWorkflowRoutes(context)) return;
      if (await handleOperationRequestRoutes(context)) return;
      if (await handlePendingActionRoutes(context)) return;
      if (await handleSandboxRoutes(context)) return;

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

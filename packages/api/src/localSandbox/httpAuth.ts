import type { IncomingMessage } from 'node:http';
import { pmsLocalAuthTokenEnvName,type PmsLocalAuthConfig } from './model.js';

export function resolveAuth(auth: PmsLocalAuthConfig | undefined) {
  const envName = auth?.envName ?? pmsLocalAuthTokenEnvName;
  const token = auth?.token ?? process.env[envName];
  return {
    envName,
    token,
    required: auth?.required ?? Boolean(token),
  };
}

export function checkAuth(request: IncomingMessage, auth: ReturnType<typeof resolveAuth>) {
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

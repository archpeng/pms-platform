import type {
  PmsLocalSandboxStore,
  ProjectionDispatchMarkOptions,
  ProjectionDispatchWorkItem,
} from '../localSandbox/model.js';
import { isRetryableDispatchError, isSkippedDispatchError } from './errors.js';
import { trimTrailingSlash } from './jsonUtils.js';
import type {
  AdapterPmsBaseRequest,
  JsonRecord,
  PmsProjectionDispatcherOptions,
} from './types.js';

export async function postAdapterProjection(
  options: PmsProjectionDispatcherOptions,
  payload: AdapterPmsBaseRequest,
): Promise<{
  ok: boolean;
  retryable: boolean;
  statusCode: number;
  message: string;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(250, options.timeoutMs ?? 5000),
  );
  try {
    const response = await fetchImpl(
      `${trimTrailingSlash(options.adapterBaseUrl)}/providers/pms-base`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.adapterToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const body = (await response.json().catch(() => ({}))) as JsonRecord;
    const code = typeof body.code === 'number' ? body.code : undefined;
    return {
      ok: response.ok && code === 0,
      retryable: response.status >= 500 || response.status === 429,
      statusCode: response.status,
      message:
        typeof body.message === 'string'
          ? body.message
          : `code:${code ?? 'missing'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function requireProjectionDispatchStore(
  store: PmsLocalSandboxStore,
): Required<
  Pick<
    PmsLocalSandboxStore,
    | 'listProjectionDispatchWork'
    | 'markProjectionDispatchDelivered'
    | 'markProjectionDispatchRetryable'
    | 'markProjectionDispatchFailed'
    | 'markProjectionDispatchSkipped'
  >
> {
  if (
    !store.listProjectionDispatchWork ||
    !store.markProjectionDispatchDelivered ||
    !store.markProjectionDispatchRetryable ||
    !store.markProjectionDispatchFailed ||
    !store.markProjectionDispatchSkipped
  ) {
    throw new Error('projection_dispatch_store_methods_missing');
  }
  return store as Required<
    Pick<
      PmsLocalSandboxStore,
      | 'listProjectionDispatchWork'
      | 'markProjectionDispatchDelivered'
      | 'markProjectionDispatchRetryable'
      | 'markProjectionDispatchFailed'
      | 'markProjectionDispatchSkipped'
    >
  >;
}

export function markOptions(
  item: ProjectionDispatchWorkItem,
  attemptedAt: string,
  redactedError?: string,
  adapterOperation?: string,
  adapterStatusCode?: number,
): ProjectionDispatchMarkOptions {
  return {
    outboxEntryId: item.entry.outboxEntryId,
    attemptedAt,
    ...(adapterOperation ? { adapterOperation } : {}),
    ...(adapterStatusCode !== undefined ? { adapterStatusCode } : {}),
    ...(redactedError ? { redactedError } : {}),
  };
}

export function retryAt(attemptedAt: string, attemptNumber: number): string {
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attemptNumber - 1));
  return new Date(new Date(attemptedAt).getTime() + delayMs).toISOString();
}

export { isRetryableDispatchError, isSkippedDispatchError };

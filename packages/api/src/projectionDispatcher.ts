import { sanitizeError } from './projectionDispatcher/jsonUtils.js';
import { mapProjectionDispatchWorkItem } from './projectionDispatcher/mapping.js';
import {
  isRetryableDispatchError,
  isSkippedDispatchError,
  markOptions,
  postAdapterProjection,
  requireProjectionDispatchStore,
  retryAt,
} from './projectionDispatcher/runtime.js';
import type {
  PmsProjectionDispatcherOptions,
  PmsProjectionDispatchOnceSummary,
  StartedPmsProjectionDispatcher,
} from './projectionDispatcher/types.js';

export { mapProjectionDispatchWorkItem } from './projectionDispatcher/mapping.js';
export type {
  PmsProjectionDispatcherOptions,
  PmsProjectionDispatchOnceSummary,
  StartedPmsProjectionDispatcher,
} from './projectionDispatcher/types.js';

export const pmsProjectionDispatchEnabledEnvName =
  'PMS_PLATFORM_PROJECTION_DISPATCH_ENABLED';
export const pmsProjectionDispatchAdapterBaseUrlEnvName =
  'PMS_PLATFORM_ADAPTER_PMS_BASE_URL';
export const pmsProjectionDispatchAdapterTokenEnvName =
  'PMS_PLATFORM_ADAPTER_PMS_BASE_TOKEN';
export const pmsProjectionDispatchIntervalMsEnvName =
  'PMS_PLATFORM_PROJECTION_DISPATCH_INTERVAL_MS';
export const pmsProjectionDispatchBatchSizeEnvName =
  'PMS_PLATFORM_PROJECTION_DISPATCH_BATCH_SIZE';
export const pmsProjectionDispatchTimeoutMsEnvName =
  'PMS_PLATFORM_PROJECTION_DISPATCH_TIMEOUT_MS';
export const pmsProjectionDispatchMaxAttemptsEnvName =
  'PMS_PLATFORM_PROJECTION_DISPATCH_MAX_ATTEMPTS';

export async function dispatchProjectionOutboxOnce(
  options: PmsProjectionDispatcherOptions,
): Promise<PmsProjectionDispatchOnceSummary> {
  const store = requireProjectionDispatchStore(options.store);
  const now = options.now ?? (() => new Date().toISOString());
  const attemptedAt = now();
  const items = store.listProjectionDispatchWork({
    now: attemptedAt,
    limit: options.batchSize ?? 25,
  });
  const summary = {
    attempted: 0,
    delivered: 0,
    retryable: 0,
    failed: 0,
    skipped: 0,
  };

  for (const item of items) {
    const attemptNumber = item.ledger.attemptCount + 1;
    try {
      const adapterRequest = mapProjectionDispatchWorkItem(item, attemptedAt);
      if (!adapterRequest) {
        store.markProjectionDispatchSkipped(
          markOptions(item, attemptedAt, 'projection_kind_skipped'),
        );
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;
      const response = await postAdapterProjection(options, adapterRequest);
      const markBase = markOptions(
        item,
        attemptedAt,
        undefined,
        adapterRequest.operation,
        response.statusCode,
      );
      if (response.ok) {
        store.markProjectionDispatchDelivered(markBase);
        summary.delivered += 1;
        continue;
      }

      const redactedError = `adapter_http_${response.statusCode}:${sanitizeError(response.message)}`;
      if (response.retryable && attemptNumber < (options.maxAttempts ?? 5)) {
        store.markProjectionDispatchRetryable({
          ...markBase,
          redactedError,
          nextAttemptAt: retryAt(attemptedAt, attemptNumber),
        });
        summary.retryable += 1;
      } else {
        store.markProjectionDispatchFailed({ ...markBase, redactedError });
        summary.failed += 1;
      }
    } catch (error) {
      const redactedError = sanitizeError(
        error instanceof Error ? error.message : String(error),
      );
      const markBase = markOptions(item, attemptedAt, redactedError);
      if (
        attemptNumber < (options.maxAttempts ?? 5) &&
        isRetryableDispatchError(error)
      ) {
        store.markProjectionDispatchRetryable({
          ...markBase,
          nextAttemptAt: retryAt(attemptedAt, attemptNumber),
        });
        summary.retryable += 1;
      } else if (isSkippedDispatchError(error)) {
        store.markProjectionDispatchSkipped(markBase);
        summary.skipped += 1;
      } else {
        store.markProjectionDispatchFailed(markBase);
        summary.failed += 1;
      }
    }
  }

  return summary;
}

export function startProjectionDispatcher(
  options: PmsProjectionDispatcherOptions,
): StartedPmsProjectionDispatcher {
  let stopped = false;
  let running: Promise<void> | undefined;
  const intervalMs = Math.max(250, options.intervalMs ?? 5000);

  const tick = () => {
    if (stopped || running) return;
    running = dispatchProjectionOutboxOnce(options)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        running = undefined;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}

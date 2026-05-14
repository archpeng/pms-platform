import type { CheckInApiResponse, CheckOutApiResponse, PmsExtendedCommandApiResponse } from './commandApi.js';
import type { PendingActionCallbackApiResponse } from './pendingActionApi.js';
import type { ReservationCancelPrepareApiResponse } from './reservationCancelWorkflowApi.js';
import type { ReservationDraftWorkflowApiResponse } from './reservationWorkflowApi.js';
import type { ReservationGroupDraftWorkflowApiResponse } from './reservationGroupWorkflowApi.js';

export interface ApiIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly response: CheckInApiResponse | CheckOutApiResponse | PmsExtendedCommandApiResponse | ReservationDraftWorkflowApiResponse | ReservationGroupDraftWorkflowApiResponse | ReservationCancelPrepareApiResponse | PendingActionCallbackApiResponse;
}

export interface ApiIdempotencyRepository {
  get(idempotencyKey: string): ApiIdempotencyRecord | undefined;
  save(record: ApiIdempotencyRecord): void;
  list(): readonly ApiIdempotencyRecord[];
}

export function createInMemoryApiIdempotencyRepository(
  initialRecords: readonly ApiIdempotencyRecord[] = [],
): ApiIdempotencyRepository {
  const records = new Map(initialRecords.map((record) => [record.idempotencyKey, cloneRecord(record)]));

  return {
    get(idempotencyKey) {
      const record = records.get(idempotencyKey);
      return record ? cloneRecord(record) : undefined;
    },
    save(record) {
      records.set(record.idempotencyKey, cloneRecord(record));
    },
    list() {
      return Array.from(records.values(), cloneRecord);
    },
  };
}

function cloneRecord(record: ApiIdempotencyRecord): ApiIdempotencyRecord {
  return cloneValue(record);
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

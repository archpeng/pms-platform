import type {
  PmsLocalSandboxStore,
  ProjectionDispatchWorkItem,
} from '../localSandbox/model.js';

export const pmsBaseProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export type JsonRecord = Record<string, unknown>;

export type AdapterPmsBaseRequest =
  | {
      readonly operation: 'pms_base_upsert_room_projection';
      readonly roomNumber: string;
      readonly fields: JsonRecord;
    }
  | {
      readonly operation: 'pms_base_upsert_reservation_projection';
      readonly reservationCode: string;
      readonly fields: JsonRecord;
    }
  | {
      readonly operation: 'pms_base_upsert_housekeeping_task_projection';
      readonly taskId: string;
      readonly fields: JsonRecord;
    }
  | {
      readonly operation: 'pms_base_upsert_maintenance_ticket_projection';
      readonly ticketId: string;
      readonly fields: JsonRecord;
    }
  | {
      readonly operation: 'pms_base_upsert_operation_request';
      readonly clientToken: string;
      readonly fields: JsonRecord;
    };

export interface PmsProjectionDispatcherOptions {
  readonly store: PmsLocalSandboxStore;
  readonly adapterBaseUrl: string;
  readonly adapterToken: string;
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => string;
}

export interface PmsProjectionDispatchOnceSummary {
  readonly attempted: number;
  readonly delivered: number;
  readonly retryable: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface StartedPmsProjectionDispatcher {
  stop(): Promise<void>;
}

export type ProjectionDispatchStoreMethods = Required<
  Pick<
    PmsLocalSandboxStore,
    | 'listProjectionDispatchWork'
    | 'markProjectionDispatchDelivered'
    | 'markProjectionDispatchRetryable'
    | 'markProjectionDispatchFailed'
    | 'markProjectionDispatchSkipped'
  >
>;

export type SelectedProjectionRoom = NonNullable<
  ProjectionDispatchWorkItem['selectedRooms']
>[number];

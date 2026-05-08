export const pmsProjectionOutboxSchemaVersion = 'pms-projection-outbox-v1';

export type ProjectionOutboxTargetFamily = 'pms-base-projection';
export type ProjectionOutboxSourceType = 'domainEvent' | 'reservation' | 'reservationDraftAudit' | 'reservationGroupDraftAudit' | 'operationRequest' | 'apiIdempotency';
export type ProjectionOutboxStatus = 'pending' | 'retryable' | 'skipped';
export type ProjectionOutboxKind =
  | 'roomLedger'
  | 'operationLog'
  | 'housekeepingTask'
  | 'maintenanceTicket'
  | 'reservation'
  | 'reservationWorkflow'
  | 'operationRequestStatus'
  | 'dryRunReadback';

export interface ProjectionOutboxEntry {
  readonly schemaVersion: typeof pmsProjectionOutboxSchemaVersion;
  readonly outboxEntryId: string;
  readonly owner: 'pms-platform';
  readonly targetFamily: ProjectionOutboxTargetFamily;
  readonly projectionKind: ProjectionOutboxKind;
  readonly sourceType: ProjectionOutboxSourceType;
  readonly sourceRef: string;
  readonly aggregateRef?: string;
  readonly correlationId?: string;
  readonly idempotencyKeyHash?: string;
  readonly status: ProjectionOutboxStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt?: string;
  readonly redactedError?: string;
  readonly generatedAt: string;
  readonly updatedAt: string;
  readonly deliveryOwner: 'adapter';
  readonly truthOwner: 'pms-platform';
}

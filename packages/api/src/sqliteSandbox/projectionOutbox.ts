import { createHash } from 'node:crypto';
import {
  pmsProjectionOutboxSchemaVersion,
  type DomainEvent,
  type OperationRequest,
  type ProjectionOutboxEntry,
  type ReservationDraftAuditRef,
  type ReservationGroupDraftAuditRef,
  type ReservationReadModel,
} from '@pms-platform/contracts';
import { type PmsSandboxIdempotencyReadback } from '../localSandbox.js';

export function deriveProjectionOutboxEntries(input: {
  domainEvents: readonly DomainEvent[];
  reservations: readonly ReservationReadModel[];
  reservationDraftAudits: readonly ReservationDraftAuditRef[];
  reservationGroupDraftAudits: readonly ReservationGroupDraftAuditRef[];
  operationRequests: readonly OperationRequest[];
  idempotencyRecords: readonly PmsSandboxIdempotencyReadback[];
  generatedAt: string;
}): ProjectionOutboxEntry[] {
  const entries: ProjectionOutboxEntry[] = [];
  for (const event of input.domainEvents) {
    entries.push(projectionOutboxEntry({
      sourceType: 'domainEvent',
      sourceRef: event.eventId,
      projectionKind: projectionKindFromDomainEvent(event),
      aggregateRef: event.aggregateId,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey,
      generatedAt: event.occurredAt,
      updatedAt: event.occurredAt,
      status: 'pending',
    }));
  }
  for (const reservation of input.reservations) {
    entries.push(projectionOutboxEntry({
      sourceType: 'reservation',
      sourceRef: reservation.reservationId,
      projectionKind: 'reservation',
      aggregateRef: reservation.reservationId,
      generatedAt: input.generatedAt,
      updatedAt: input.generatedAt,
      status: 'pending',
    }));
  }
  for (const audit of input.reservationDraftAudits) {
    entries.push(projectionOutboxEntry({
      sourceType: 'reservationDraftAudit',
      sourceRef: audit.auditId,
      projectionKind: 'reservationWorkflow',
      aggregateRef: audit.auditId,
      generatedAt: audit.occurredAt,
      updatedAt: audit.occurredAt,
      status: 'pending',
    }));
  }
  for (const audit of input.reservationGroupDraftAudits) {
    entries.push(projectionOutboxEntry({
      sourceType: 'reservationGroupDraftAudit',
      sourceRef: audit.auditId,
      projectionKind: 'reservationWorkflow',
      aggregateRef: audit.auditId,
      generatedAt: audit.occurredAt,
      updatedAt: audit.occurredAt,
      status: 'pending',
    }));
  }
  for (const request of input.operationRequests) {
    const status = retryableOperationRequestStatuses.has(request.status) ? 'retryable' : 'pending';
    entries.push(projectionOutboxEntry({
      sourceType: 'operationRequest',
      sourceRef: request.operationRequestId,
      projectionKind: 'operationRequestStatus',
      aggregateRef: request.operationRequestId,
      generatedAt: request.createdAt,
      updatedAt: request.updatedAt,
      status,
      redactedError: status === 'retryable' ? `operation-request-status:${request.status}` : undefined,
    }));
  }
  for (const record of input.idempotencyRecords) {
    if (record.mode !== 'dryRun' || !record.ok) continue;
    entries.push(projectionOutboxEntry({
      sourceType: 'apiIdempotency',
      sourceRef: stableRefHash(`${record.operation}:${record.idempotencyKey}`),
      projectionKind: 'dryRunReadback',
      aggregateRef: record.operation,
      idempotencyKey: record.idempotencyKey,
      generatedAt: input.generatedAt,
      updatedAt: input.generatedAt,
      status: 'skipped',
    }));
  }
  return entries.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt) || left.outboxEntryId.localeCompare(right.outboxEntryId));
}

const retryableOperationRequestStatuses = new Set(['failed', 'needsManualReview']);

function projectionKindFromDomainEvent(event: DomainEvent): ProjectionOutboxEntry['projectionKind'] {
  if (event.type === 'HousekeepingTaskCreated' || event.type.startsWith('Housekeeping')) return 'housekeepingTask';
  if (event.type === 'MaintenanceReported' || event.type === 'MaintenanceCompleted') return 'maintenanceTicket';
  return 'roomLedger';
}

function projectionOutboxEntry(input: {
  sourceType: ProjectionOutboxEntry['sourceType'];
  sourceRef: string;
  projectionKind: ProjectionOutboxEntry['projectionKind'];
  aggregateRef?: string;
  correlationId?: string;
  idempotencyKey?: string;
  status: ProjectionOutboxEntry['status'];
  redactedError?: string;
  generatedAt: string;
  updatedAt: string;
}): ProjectionOutboxEntry {
  return {
    schemaVersion: pmsProjectionOutboxSchemaVersion,
    outboxEntryId: `projection-outbox:${input.sourceType}:${stableRefHash(input.sourceRef)}`,
    owner: 'pms-platform',
    targetFamily: 'pms-base-projection',
    projectionKind: input.projectionKind,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    ...(input.aggregateRef ? { aggregateRef: input.aggregateRef } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.idempotencyKey ? { idempotencyKeyHash: stableRefHash(input.idempotencyKey) } : {}),
    status: input.status,
    attemptCount: 0,
    ...(input.status === 'retryable' ? { nextAttemptAt: input.updatedAt } : {}),
    ...(input.redactedError ? { redactedError: input.redactedError } : {}),
    generatedAt: input.generatedAt,
    updatedAt: input.updatedAt,
    deliveryOwner: 'adapter',
    truthOwner: 'pms-platform',
  };
}

function stableRefHash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

import { type ProjectionOutboxEntry } from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchListOptions,
  type ProjectionDispatchMarkOptions,
  type ProjectionDispatchStatus,
  type ProjectionDispatchWorkItem,
} from '../localSandbox/model.js';
import {
  ProjectionDispatchLedgerRow,
  cloneValue,
  housekeepingTaskIdFromEvent,
  parseJson,
  projectionDispatchLedgerFromRow,
  requestModeFromRecord,
  requestOperationFromRecord,
  reservationDraftRefFromStored,
  reservationGroupDraftRefFromStored,
  roomIdFromEvent,
} from './model.js';
import { deriveProjectionOutboxEntries } from './projectionOutbox.js';
import { SqliteSandboxReadbackStore } from './readbackStore.js';

export abstract class SqliteSandboxProjectionDispatchStore extends SqliteSandboxReadbackStore {
  listProjectionDispatchWork(
    options: ProjectionDispatchListOptions = {},
  ): readonly ProjectionDispatchWorkItem[] {
    return this.runInTransaction(() => {
      const generatedAt = options.now ?? this.now();
      const dueAt = options.now ?? generatedAt;
      const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
      const entries = this.deriveCurrentProjectionOutbox(generatedAt);
      this.ensureProjectionDispatchLedger(entries, generatedAt);

      const items: ProjectionDispatchWorkItem[] = [];
      for (const entry of entries) {
        const ledger = this.getProjectionDispatchLedgerEntry(
          entry.outboxEntryId,
        );
        if (!entry || !ledger) continue;
        if (ledger.status !== 'pending' && ledger.status !== 'retryable')
          continue;
        if (ledger.nextAttemptAt && ledger.nextAttemptAt > dueAt) continue;
        items.push(this.buildProjectionDispatchWorkItem(entry, ledger));
        if (items.length >= limit) break;
      }
      return cloneValue(items);
    });
  }

  markProjectionDispatchDelivered(
    options: ProjectionDispatchMarkOptions,
  ): void {
    this.runInTransaction(() =>
      this.updateProjectionDispatchLedger(options, 'delivered'),
    );
  }

  markProjectionDispatchRetryable(
    options: ProjectionDispatchMarkOptions,
  ): void {
    this.runInTransaction(() =>
      this.updateProjectionDispatchLedger(options, 'retryable'),
    );
  }

  markProjectionDispatchFailed(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() =>
      this.updateProjectionDispatchLedger(options, 'failed'),
    );
  }

  markProjectionDispatchSkipped(options: ProjectionDispatchMarkOptions): void {
    this.runInTransaction(() =>
      this.updateProjectionDispatchLedger(options, 'skipped'),
    );
  }

  protected deriveCurrentProjectionOutbox(
    generatedAt: string,
  ): ProjectionOutboxEntry[] {
    const idempotencyRecords = this.listApiIdempotencyRecords().map(
      (record) => ({
        operation: requestOperationFromRecord(record),
        mode: requestModeFromRecord(record),
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        ok: record.response.ok,
      }),
    );
    return deriveProjectionOutboxEntries({
      domainEvents: this.listDomainEvents(),
      reservations: this.listReservations(),
      reservationDraftAudits: this.listReservationDraftAudits(),
      reservationGroupDraftAudits: this.listReservationGroupDraftAudits(),
      operationRequests: this.listOperationRequestRecords(),
      idempotencyRecords,
      generatedAt,
    });
  }

  protected ensureProjectionDispatchLedger(
    entries: readonly ProjectionOutboxEntry[],
    now: string,
  ): void {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO projection_dispatch_ledger (
        outbox_entry_id, status, attempt_count, next_attempt_at, redacted_error, created_at, updated_at
      )
      VALUES (?, ?, 0, ?, ?, ?, ?)
    `);
    for (const entry of entries) {
      const status: ProjectionDispatchStatus =
        entry.status === 'skipped'
          ? 'skipped'
          : entry.status === 'retryable'
            ? 'retryable'
            : 'pending';
      statement.run(
        entry.outboxEntryId,
        status,
        entry.nextAttemptAt ??
          (status === 'retryable' ? entry.updatedAt : null),
        entry.redactedError ?? null,
        now,
        now,
      );
    }
  }

  protected getProjectionDispatchLedgerEntry(
    outboxEntryId: string,
  ): ProjectionDispatchLedgerEntry | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM projection_dispatch_ledger WHERE outbox_entry_id = ?',
      )
      .get(outboxEntryId) as ProjectionDispatchLedgerRow | undefined;
    return row ? projectionDispatchLedgerFromRow(row) : undefined;
  }

  protected updateProjectionDispatchLedger(
    options: ProjectionDispatchMarkOptions,
    status: ProjectionDispatchStatus,
  ): void {
    this.db
      .prepare(
        `
          UPDATE projection_dispatch_ledger
          SET status = ?,
              attempt_count = attempt_count + 1,
              adapter_operation = ?,
              adapter_status_code = ?,
              last_attempt_at = ?,
              next_attempt_at = ?,
              redacted_error = ?,
              updated_at = ?
          WHERE outbox_entry_id = ?
        `,
      )
      .run(
        status,
        options.adapterOperation ?? null,
        options.adapterStatusCode ?? null,
        options.attemptedAt,
        options.nextAttemptAt ?? null,
        options.redactedError ?? null,
        options.attemptedAt,
        options.outboxEntryId,
      );
  }

  protected buildProjectionDispatchWorkItem(
    entry: ProjectionOutboxEntry,
    ledger: ProjectionDispatchLedgerEntry,
  ): ProjectionDispatchWorkItem {
    if (entry.sourceType === 'domainEvent') {
      const event = this.listDomainEvents().find(
        (candidate) => candidate.eventId === entry.sourceRef,
      );
      const roomId = event ? roomIdFromEvent(event) : undefined;
      const room = roomId ? this.getRoom(roomId) : undefined;
      const housekeepingTask =
        event &&
        (event.type === 'HousekeepingTaskCreated' ||
          event.type.startsWith('Housekeeping'))
          ? this.getHousekeepingTask(housekeepingTaskIdFromEvent(event))
          : undefined;
      const maintenanceTicket =
        event &&
        (event.type === 'MaintenanceReported' ||
          event.type === 'MaintenanceCompleted')
          ? this.getMaintenanceTicket(event.ticket.ticketId)
          : undefined;
      return {
        entry,
        ledger,
        ...(event ? { domainEvent: event } : {}),
        ...(room ? { room } : {}),
        ...(housekeepingTask ? { housekeepingTask } : {}),
        ...(maintenanceTicket ? { maintenanceTicket } : {}),
      };
    }

    if (entry.sourceType === 'reservation') {
      const row = this.getReservationRowById(entry.sourceRef);
      const reservation = row
        ? this.reservationReadModelFromRow(row, entry.generatedAt)
        : undefined;
      const room = reservation?.roomId
        ? this.getRoom(reservation.roomId)
        : undefined;
      return {
        entry,
        ledger,
        ...(reservation ? { reservation } : {}),
        ...(room ? { room } : {}),
      };
    }

    if (entry.sourceType === 'reservationDraftAudit') {
      const audit = this.getReservationDraftAuditPayload(entry.sourceRef);
      const draft = audit
        ? this.getReservationDraftById(audit.draft_id)
        : undefined;
      const selectedRooms = draft?.slots.roomId
        ? [this.getRoom(draft.slots.roomId)].filter(
            (room): room is RoomAggregate => Boolean(room),
          )
        : [];
      return {
        entry,
        ledger,
        ...(selectedRooms.length > 0 ? { selectedRooms } : {}),
        ...(audit
          ? {
              audit: {
                auditId: audit.audit_id,
                action: audit.action,
                occurredAt: audit.occurred_at,
                payload: parseJson<unknown>(audit.payload_json),
              },
            }
          : {}),
        ...(draft
          ? {
              reservationWorkflow: {
                workflowType: 'reservation',
                propertyId: draft.propertyId,
                clientToken: draft.clientToken,
                requestFingerprint: draft.requestFingerprint,
                draft: reservationDraftRefFromStored(
                  draft,
                  audit
                    ? [
                        {
                          auditId: audit.audit_id,
                          action: audit.action,
                          occurredAt: audit.occurred_at,
                        },
                      ]
                    : [],
                  { includeDraftId: true },
                ),
              },
            }
          : {}),
      };
    }

    if (entry.sourceType === 'reservationGroupDraftAudit') {
      const audit = this.getReservationGroupDraftAuditPayload(entry.sourceRef);
      const draft = audit
        ? this.getReservationGroupDraftById(audit.group_draft_id)
        : undefined;
      const selectedRooms =
        draft?.slots.selections
          ?.map((selection) => this.getRoom(selection.roomId))
          .filter((room): room is RoomAggregate => Boolean(room)) ?? [];
      return {
        entry,
        ledger,
        ...(selectedRooms.length > 0 ? { selectedRooms } : {}),
        ...(audit
          ? {
              audit: {
                auditId: audit.audit_id,
                action: audit.action,
                occurredAt: audit.occurred_at,
                payload: parseJson<unknown>(audit.payload_json),
              },
            }
          : {}),
        ...(draft
          ? {
              reservationWorkflow: {
                workflowType: 'reservationGroup',
                propertyId: draft.propertyId,
                clientToken: draft.clientToken,
                requestFingerprint: draft.requestFingerprint,
                groupDraft: reservationGroupDraftRefFromStored(
                  draft,
                  audit
                    ? [
                        {
                          auditId: audit.audit_id,
                          action: audit.action,
                          occurredAt: audit.occurred_at,
                        },
                      ]
                    : [],
                  { includeGroupDraftId: true },
                ),
              },
            }
          : {}),
      };
    }

    if (entry.sourceType === 'operationRequest') {
      const operationRequest = this.getOperationRequestById(entry.sourceRef);
      return {
        entry,
        ledger,
        ...(operationRequest ? { operationRequest } : {}),
      };
    }

    return { entry, ledger };
  }
}

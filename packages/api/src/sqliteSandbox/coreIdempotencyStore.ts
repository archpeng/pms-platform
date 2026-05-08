import { type AuditEntry, type DomainEvent } from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
} from '@pms-platform/core';
import { type ApiIdempotencyRecord } from '../index.js';
import { SqliteSandboxCoreTaskStore } from './coreTaskStore.js';
import {
  ApiIdempotencyRow,
  JsonPayloadRow,
  apiIdempotencyFromRow,
  parseJson,
  requestJsonFromRecord,
  requestModeFromRecord,
  requestOperationFromRecord,
  roomIdFromEvent,
} from './model.js';

export abstract class SqliteSandboxCoreIdempotencyStore extends SqliteSandboxCoreTaskStore {
  protected appendAudit(entry: AuditEntry): void {
    this.db
      .prepare(
        `
          INSERT INTO audits (audit_id, room_id, command_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        entry.auditId,
        entry.roomId,
        entry.commandType,
        entry.correlationId,
        entry.idempotencyKey,
        entry.occurredAt,
        JSON.stringify(entry),
      );
  }

  protected listAudits(): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM audits ORDER BY occurred_at, audit_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<AuditEntry>(row.payload_json));
  }

  protected listAuditsByRoomIds(roomIds: ReadonlySet<string>): AuditEntry[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listAudits().filter((entry) => roomIds.has(entry.roomId));
  }

  protected appendDomainEvent(event: DomainEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO domain_events (event_id, room_id, event_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        event.eventId,
        roomIdFromEvent(event) ?? null,
        event.type,
        event.correlationId,
        event.idempotencyKey,
        event.occurredAt,
        JSON.stringify(event),
      );
  }

  protected listDomainEvents(): DomainEvent[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM domain_events ORDER BY sequence')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<DomainEvent>(row.payload_json));
  }

  protected listDomainEventsByRoomIds(
    roomIds: ReadonlySet<string>,
  ): DomainEvent[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listDomainEvents().filter((event) => {
      const roomId = roomIdFromEvent(event);
      return roomId ? roomIds.has(roomId) : false;
    });
  }

  protected getCoreIdempotency(
    idempotencyKey: string,
  ):
    | CoreCheckInConfirmResult
    | CoreCheckOutConfirmResult
    | CorePmsCommandConfirmResult
    | undefined {
    const row = this.db
      .prepare(
        'SELECT response_json FROM core_idempotency WHERE idempotency_key = ?',
      )
      .get(idempotencyKey) as { response_json: string } | undefined;
    return row
      ? parseJson<
          | CoreCheckInConfirmResult
          | CoreCheckOutConfirmResult
          | CorePmsCommandConfirmResult
        >(row.response_json)
      : undefined;
  }

  protected saveCoreIdempotency(
    idempotencyKey: string,
    response:
      | CoreCheckInConfirmResult
      | CoreCheckOutConfirmResult
      | CorePmsCommandConfirmResult,
  ): void {
    const timestamp = this.now();
    this.db
      .prepare(
        `
          INSERT INTO core_idempotency (idempotency_key, response_json, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET
            response_json = excluded.response_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(idempotencyKey, JSON.stringify(response), timestamp, timestamp);
  }

  protected getApiIdempotency(
    idempotencyKey: string,
  ): ApiIdempotencyRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency WHERE idempotency_key = ?',
      )
      .get(idempotencyKey) as ApiIdempotencyRow | undefined;
    return row ? apiIdempotencyFromRow(row) : undefined;
  }

  protected listApiIdempotencyRecords(): ApiIdempotencyRecord[] {
    const rows = this.db
      .prepare(
        'SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency ORDER BY created_at, idempotency_key',
      )
      .all() as unknown as ApiIdempotencyRow[];
    return rows.map(apiIdempotencyFromRow);
  }

  protected saveApiIdempotency(record: ApiIdempotencyRecord): void {
    const timestamp = this.now();
    this.db
      .prepare(
        `
          INSERT INTO api_idempotency (idempotency_key, operation, mode, request_fingerprint, request_json, response_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET
            operation = excluded.operation,
            mode = excluded.mode,
            request_fingerprint = excluded.request_fingerprint,
            request_json = excluded.request_json,
            response_json = excluded.response_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.idempotencyKey,
        requestOperationFromRecord(record),
        requestModeFromRecord(record),
        record.requestFingerprint,
        JSON.stringify(requestJsonFromRecord(record)),
        JSON.stringify(record.response),
        timestamp,
        timestamp,
      );
  }
}

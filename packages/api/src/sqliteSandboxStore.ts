import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuditEntry, DomainEvent, HousekeepingTask } from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePorts,
  type DomainEventCollector,
  type IdempotencyRepository,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  pmsCheckInOperation,
  pmsCheckOutOperation,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckOutApiRequest,
} from './index.js';
import {
  pmsSandboxStateVersion,
  pmsSqliteDbPathEnvName,
  type PmsLocalSandboxStore,
  type PmsLocalStorageMetadata,
  type PmsSandboxIdempotencyReadback,
  type PmsSandboxReadback,
} from './localSandbox.js';

export { pmsSqliteDbPathEnvName };

export interface CreateSqliteLocalSandboxStoreOptions {
  readonly dbPath: string;
  readonly seedRooms?: readonly RoomAggregate[];
  readonly resetOnStart?: boolean;
  readonly now?: () => string;
}

export class SqliteLocalSandboxStore implements PmsLocalSandboxStore {
  readonly storage: PmsLocalStorageMetadata = {
    kind: 'sqlite',
    envName: pmsSqliteDbPathEnvName,
    driver: 'node:sqlite',
    experimental: true,
  };
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;

  private readonly db: DatabaseSync;
  private readonly seedRooms: readonly RoomAggregate[];
  private readonly now: () => string;
  private transactionDepth = 0;

  constructor(options: CreateSqliteLocalSandboxStoreOptions) {
    if (options.dbPath !== ':memory:') {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(options.dbPath);
    this.seedRooms = cloneValue(options.seedRooms ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
    this.migrate();
    this.bootstrap(options);
    this.ports = this.createCorePorts();
    this.apiIdempotency = this.createApiIdempotencyRepository();
  }

  readback(roomId?: string): PmsSandboxReadback {
    const rooms = roomId ? this.getRoomsByRoomId(roomId) : this.listRooms();
    const roomIds = new Set(rooms.map((room) => room.roomId));
    const housekeepingTasks = roomId ? this.listHousekeepingTasksByRoomIds(roomIds) : this.listHousekeepingTasks();
    const audits = roomId ? this.listAuditsByRoomIds(roomIds) : this.listAudits();
    const domainEvents = roomId ? this.listDomainEventsByRoomIds(roomIds) : this.listDomainEvents();

    return {
      ok: true,
      service: 'pms-platform',
      stateVersion: pmsSandboxStateVersion,
      generatedAt: this.now(),
      storage: this.storage,
      filter: roomId ? { roomId } : {},
      rooms: cloneValue(rooms),
      housekeepingTasks: cloneValue(housekeepingTasks),
      audits: cloneValue(audits),
      domainEvents: cloneValue(domainEvents),
      idempotencyRecords: this.listApiIdempotencyRecords().map((record) => ({
        operation: requestOperationFromRecord(record),
        mode: requestModeFromRecord(record),
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        ok: record.response.ok,
      })),
    };
  }

  reset(seedRooms: readonly RoomAggregate[] = this.seedRooms): PmsSandboxReadback {
    this.runInTransaction(() => {
      this.clearBusinessTables();
      for (const room of seedRooms) {
        this.saveRoom(room);
      }
    });
    return this.readback();
  }

  runInTransaction<TValue>(operation: () => TValue): TValue {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        room_number TEXT NOT NULL,
        occupancy_status TEXT NOT NULL,
        cleaning_status TEXT NOT NULL,
        sale_status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS housekeeping_tasks (
        task_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audits (
        audit_id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS domain_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        room_id TEXT,
        event_type TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS core_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        mode TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON rooms(room_number);
      CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
      CREATE INDEX IF NOT EXISTS idx_audits_room_id ON audits(room_id);
      CREATE INDEX IF NOT EXISTS idx_audits_correlation_id ON audits(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_audits_idempotency_key ON audits(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_domain_events_room_id ON domain_events(room_id);
      CREATE INDEX IF NOT EXISTS idx_domain_events_event_type ON domain_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_domain_events_correlation_id ON domain_events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_domain_events_idempotency_key ON domain_events(idempotency_key);

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, '${escapeSqlLiteral(this.now())}');
    `);
  }

  private bootstrap(options: CreateSqliteLocalSandboxStoreOptions): void {
    if (options.resetOnStart) {
      this.reset(this.seedRooms);
      return;
    }

    if (this.hasBusinessRows()) {
      return;
    }

    this.reset(this.seedRooms);
  }

  private hasBusinessRows(): boolean {
    const row = this.db
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM rooms) +
            (SELECT COUNT(*) FROM housekeeping_tasks) +
            (SELECT COUNT(*) FROM audits) +
            (SELECT COUNT(*) FROM domain_events) +
            (SELECT COUNT(*) FROM core_idempotency) +
            (SELECT COUNT(*) FROM api_idempotency) AS total
        `,
      )
      .get() as { total: number };
    return row.total > 0;
  }

  private clearBusinessTables(): void {
    this.db.exec(`
      DELETE FROM api_idempotency;
      DELETE FROM core_idempotency;
      DELETE FROM domain_events;
      DELETE FROM audits;
      DELETE FROM housekeeping_tasks;
      DELETE FROM rooms;
    `);
  }

  private createCorePorts(): CorePorts {
    return {
      rooms: {
        get: (roomId) => cloneValue(this.getRoom(roomId)),
        save: (room) => this.saveRoom(room),
        list: () => cloneValue(this.listRooms()),
      },
      housekeepingTasks: {
        get: (taskId) => cloneValue(this.getHousekeepingTask(taskId)),
        save: (task) => this.saveHousekeepingTask(task),
        list: () => cloneValue(this.listHousekeepingTasks()),
      },
      audits: {
        append: (entry) => this.appendAudit(entry),
        list: () => cloneValue(this.listAudits()),
      },
      idempotency: this.createCoreIdempotencyRepository(),
      events: this.createDomainEventCollector(),
    };
  }

  private createCoreIdempotencyRepository(): IdempotencyRepository<CoreCheckInConfirmResult | CoreCheckOutConfirmResult> {
    return {
      get: (idempotencyKey) => cloneValue(this.getCoreIdempotency(idempotencyKey)),
      save: (idempotencyKey, response) => this.saveCoreIdempotency(idempotencyKey, response),
      has: (idempotencyKey) => Boolean(this.getCoreIdempotency(idempotencyKey)),
    };
  }

  private createDomainEventCollector(): DomainEventCollector {
    return {
      append: (event) => this.appendDomainEvent(event),
      list: () => cloneValue(this.listDomainEvents()),
      clear: () => {
        this.db.prepare('DELETE FROM domain_events').run();
      },
    };
  }

  private createApiIdempotencyRepository(): ApiIdempotencyRepository {
    return {
      get: (idempotencyKey) => cloneValue(this.getApiIdempotency(idempotencyKey)),
      save: (record) => this.saveApiIdempotency(record),
      list: () => cloneValue(this.listApiIdempotencyRecords()),
    };
  }

  private getRoom(roomId: string): RoomAggregate | undefined {
    const row = this.db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(roomId) as RoomRow | undefined;
    return row ? roomFromRow(row) : undefined;
  }

  private getRoomsByRoomId(roomId: string): RoomAggregate[] {
    return this.getRoom(roomId) ? [this.getRoom(roomId)!] : [];
  }

  private listRooms(): RoomAggregate[] {
    const rows = this.db.prepare('SELECT * FROM rooms ORDER BY room_number, room_id').all() as unknown as RoomRow[];
    return rows.map(roomFromRow);
  }

  private saveRoom(room: RoomAggregate): void {
    this.db
      .prepare(
        `
          INSERT INTO rooms (room_id, room_number, occupancy_status, cleaning_status, sale_status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(room_id) DO UPDATE SET
            room_number = excluded.room_number,
            occupancy_status = excluded.occupancy_status,
            cleaning_status = excluded.cleaning_status,
            sale_status = excluded.sale_status,
            updated_at = excluded.updated_at
        `,
      )
      .run(room.roomId, room.roomNumber, room.occupancyStatus, room.cleaningStatus, room.saleStatus, this.now());
  }

  private getHousekeepingTask(taskId: string): HousekeepingTask | undefined {
    const row = this.db.prepare('SELECT payload_json FROM housekeeping_tasks WHERE task_id = ?').get(taskId) as JsonPayloadRow | undefined;
    return row ? parseJson<HousekeepingTask>(row.payload_json) : undefined;
  }

  private listHousekeepingTasks(): HousekeepingTask[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM housekeeping_tasks ORDER BY created_at, task_id')
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<HousekeepingTask>(row.payload_json));
  }

  private listHousekeepingTasksByRoomIds(roomIds: ReadonlySet<string>): HousekeepingTask[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listHousekeepingTasks().filter((task) => roomIds.has(task.roomId));
  }

  private saveHousekeepingTask(task: HousekeepingTask): void {
    this.db
      .prepare(
        `
          INSERT INTO housekeeping_tasks (task_id, room_id, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            room_id = excluded.room_id,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(task.taskId, task.roomId, JSON.stringify(task), task.createdAt, this.now());
  }

  private appendAudit(entry: AuditEntry): void {
    this.db
      .prepare(
        `
          INSERT INTO audits (audit_id, room_id, command_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(entry.auditId, entry.roomId, entry.commandType, entry.correlationId, entry.idempotencyKey, entry.occurredAt, JSON.stringify(entry));
  }

  private listAudits(): AuditEntry[] {
    const rows = this.db.prepare('SELECT payload_json FROM audits ORDER BY occurred_at, audit_id').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<AuditEntry>(row.payload_json));
  }

  private listAuditsByRoomIds(roomIds: ReadonlySet<string>): AuditEntry[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listAudits().filter((entry) => roomIds.has(entry.roomId));
  }

  private appendDomainEvent(event: DomainEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO domain_events (event_id, room_id, event_type, correlation_id, idempotency_key, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(event.eventId, roomIdFromEvent(event) ?? null, event.type, event.correlationId, event.idempotencyKey, event.occurredAt, JSON.stringify(event));
  }

  private listDomainEvents(): DomainEvent[] {
    const rows = this.db.prepare('SELECT payload_json FROM domain_events ORDER BY sequence').all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<DomainEvent>(row.payload_json));
  }

  private listDomainEventsByRoomIds(roomIds: ReadonlySet<string>): DomainEvent[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listDomainEvents().filter((event) => {
      const roomId = roomIdFromEvent(event);
      return roomId ? roomIds.has(roomId) : false;
    });
  }

  private getCoreIdempotency(idempotencyKey: string): CoreCheckInConfirmResult | CoreCheckOutConfirmResult | undefined {
    const row = this.db.prepare('SELECT response_json FROM core_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | { response_json: string }
      | undefined;
    return row ? parseJson<CoreCheckInConfirmResult | CoreCheckOutConfirmResult>(row.response_json) : undefined;
  }

  private saveCoreIdempotency(idempotencyKey: string, response: CoreCheckInConfirmResult | CoreCheckOutConfirmResult): void {
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

  private getApiIdempotency(idempotencyKey: string): ApiIdempotencyRecord | undefined {
    const row = this.db.prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency WHERE idempotency_key = ?').get(idempotencyKey) as
      | ApiIdempotencyRow
      | undefined;
    return row ? apiIdempotencyFromRow(row) : undefined;
  }

  private listApiIdempotencyRecords(): ApiIdempotencyRecord[] {
    const rows = this.db
      .prepare('SELECT idempotency_key, request_fingerprint, response_json FROM api_idempotency ORDER BY created_at, idempotency_key')
      .all() as unknown as ApiIdempotencyRow[];
    return rows.map(apiIdempotencyFromRow);
  }

  private saveApiIdempotency(record: ApiIdempotencyRecord): void {
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

export function createSqliteLocalSandboxStore(options: CreateSqliteLocalSandboxStoreOptions): SqliteLocalSandboxStore {
  return new SqliteLocalSandboxStore(options);
}

interface RoomRow {
  readonly room_id: string;
  readonly room_number: string;
  readonly occupancy_status: RoomAggregate['occupancyStatus'];
  readonly cleaning_status: RoomAggregate['cleaningStatus'];
  readonly sale_status: RoomAggregate['saleStatus'];
}

interface JsonPayloadRow {
  readonly payload_json: string;
}

interface ApiIdempotencyRow {
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly response_json: string;
}

function roomFromRow(row: RoomRow): RoomAggregate {
  return {
    roomId: row.room_id,
    roomNumber: row.room_number,
    occupancyStatus: row.occupancy_status,
    cleaningStatus: row.cleaning_status,
    saleStatus: row.sale_status,
  };
}

function apiIdempotencyFromRow(row: ApiIdempotencyRow): ApiIdempotencyRecord {
  return {
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    response: parseJson<ApiIdempotencyRecord['response']>(row.response_json),
  };
}

function requestOperationFromRecord(record: ApiIdempotencyRecord): PmsSandboxIdempotencyReadback['operation'] {
  return record.response.ok && (record.response.operation === pmsCheckInOperation || record.response.operation === pmsCheckOutOperation)
    ? record.response.operation
    : 'unknown';
}

function requestModeFromRecord(record: ApiIdempotencyRecord): CheckInApiRequest['mode'] | CheckOutApiRequest['mode'] | 'unknown' {
  return record.response.ok ? record.response.mode : record.response.mode === 'dryRun' || record.response.mode === 'confirm' ? record.response.mode : 'unknown';
}

function requestJsonFromRecord(record: ApiIdempotencyRecord): unknown {
  return record.response.ok ? record.response.request.fingerprintInput : { mode: record.response.mode };
}

function roomIdFromEvent(event: DomainEvent): string | undefined {
  if (event.type === 'RoomCheckedIn' || event.type === 'RoomCheckedOut') {
    return event.roomId;
  }
  return event.task.roomId;
}

function parseJson<TValue>(raw: string): TValue {
  return JSON.parse(raw) as TValue;
}

function cloneValue<TValue>(value: TValue): TValue {
  if (value === undefined) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

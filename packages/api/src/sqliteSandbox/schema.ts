import type { DatabaseSync } from 'node:sqlite';

export function migrateSqliteSandboxSchema(db: DatabaseSync, appliedAt: string): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY,
      room_number TEXT NOT NULL,
      property_id TEXT,
      room_type_id TEXT,
      room_type TEXT,
      zone TEXT,
      sort_key TEXT,
      occupancy_status TEXT NOT NULL,
      cleaning_status TEXT NOT NULL,
      sale_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS properties (
      property_id TEXT PRIMARY KEY,
      property_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_types (
      room_type_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      room_type_code TEXT NOT NULL,
      display_name TEXT NOT NULL,
      sort_key TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      ticket_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guests (
      guest_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      profile_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      reservation_id TEXT PRIMARY KEY,
      reservation_code TEXT NOT NULL UNIQUE,
      property_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      room_id TEXT,
      room_number TEXT,
      room_type_id TEXT,
      room_type TEXT,
      arrival_date TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (guest_id) REFERENCES guests(guest_id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS reservation_room_allocations (
      allocation_id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      room_id TEXT,
      room_number TEXT,
      room_type_id TEXT,
      room_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservation_drafts (
      draft_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      client_token TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL,
      slots_json TEXT NOT NULL,
      missing_slots_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      quote_json TEXT,
      pending_action_json TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservation_group_drafts (
      group_draft_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      client_token TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL,
      slots_json TEXT NOT NULL,
      missing_slots_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      quote_json TEXT,
      pending_action_json TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservation_draft_audits (
      audit_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES reservation_drafts(draft_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservation_group_draft_audits (
      audit_id TEXT PRIMARY KEY,
      group_draft_id TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (group_draft_id) REFERENCES reservation_group_drafts(group_draft_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stays (
      stay_id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      room_id TEXT,
      room_number TEXT,
      checked_in_at TEXT,
      checked_out_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_blocks (
      block_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      room_type_id TEXT,
      block_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      UNIQUE (source_type, source_id, room_id, block_type)
    );

    CREATE TABLE IF NOT EXISTS inventory_day_room (
      business_date TEXT NOT NULL,
      property_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      room_number TEXT NOT NULL,
      room_type_id TEXT,
      room_type TEXT,
      availability_status TEXT NOT NULL,
      source_refs_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (business_date, room_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_interval_projection (
      projection_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      room_number TEXT NOT NULL,
      room_type_id TEXT,
      room_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      calendar_kind TEXT NOT NULL,
      sellable_status TEXT NOT NULL,
      title TEXT NOT NULL,
      source_refs_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_summary_day_type (
      business_date TEXT NOT NULL,
      property_id TEXT NOT NULL,
      room_type_id TEXT NOT NULL,
      room_type TEXT,
      total_rooms INTEGER NOT NULL,
      available_rooms INTEGER NOT NULL,
      occupied_rooms INTEGER NOT NULL,
      blocked_rooms INTEGER NOT NULL,
      reserved_rooms INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (business_date, property_id, room_type_id)
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

    CREATE TABLE IF NOT EXISTS operation_requests (
      operation_request_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      client_token TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      room_id TEXT,
      room_number TEXT,
      reservation_id TEXT,
      payload_json TEXT NOT NULL,
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projection_dispatch_ledger (
      outbox_entry_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      adapter_operation TEXT,
      adapter_status_code INTEGER,
      last_attempt_at TEXT,
      next_attempt_at TEXT,
      redacted_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_room_number ON rooms(room_number);
    CREATE INDEX IF NOT EXISTS idx_room_types_property_id ON room_types(property_id);
    CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_room_id ON maintenance_tickets(room_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON reservations(room_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_arrival_date ON reservations(arrival_date);
    CREATE INDEX IF NOT EXISTS idx_reservations_departure_date ON reservations(departure_date);
    CREATE INDEX IF NOT EXISTS idx_reservation_allocations_room_id ON reservation_room_allocations(room_id);
    CREATE INDEX IF NOT EXISTS idx_reservation_drafts_client_token ON reservation_drafts(client_token);
    CREATE INDEX IF NOT EXISTS idx_reservation_drafts_status ON reservation_drafts(status);
    CREATE INDEX IF NOT EXISTS idx_reservation_draft_audits_draft_id ON reservation_draft_audits(draft_id);
    CREATE INDEX IF NOT EXISTS idx_reservation_group_drafts_client_token ON reservation_group_drafts(client_token);
    CREATE INDEX IF NOT EXISTS idx_reservation_group_drafts_status ON reservation_group_drafts(status);
    CREATE INDEX IF NOT EXISTS idx_reservation_group_draft_audits_group_draft_id ON reservation_group_draft_audits(group_draft_id);
    CREATE INDEX IF NOT EXISTS idx_stays_room_id ON stays(room_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_blocks_room_id ON inventory_blocks(room_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_blocks_source ON inventory_blocks(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_day_room_date ON inventory_day_room(business_date);
    CREATE INDEX IF NOT EXISTS idx_inventory_interval_projection_room_id ON inventory_interval_projection(room_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_summary_day_type_date ON inventory_summary_day_type(business_date);
    CREATE INDEX IF NOT EXISTS idx_audits_room_id ON audits(room_id);
    CREATE INDEX IF NOT EXISTS idx_audits_correlation_id ON audits(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_audits_idempotency_key ON audits(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_domain_events_room_id ON domain_events(room_id);
    CREATE INDEX IF NOT EXISTS idx_domain_events_event_type ON domain_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_operation_requests_client_token ON operation_requests(client_token);
    CREATE INDEX IF NOT EXISTS idx_operation_requests_room_id ON operation_requests(room_id);
    CREATE INDEX IF NOT EXISTS idx_operation_requests_status ON operation_requests(status);
    CREATE INDEX IF NOT EXISTS idx_projection_dispatch_status_next_attempt
      ON projection_dispatch_ledger(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_domain_events_correlation_id ON domain_events(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_domain_events_idempotency_key ON domain_events(idempotency_key);

    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (1, '${escapeSqlLiteral(appliedAt)}');
  `);

  addColumnIfMissing(db, 'rooms', 'property_id', 'TEXT');
  addColumnIfMissing(db, 'rooms', 'room_type_id', 'TEXT');
  addColumnIfMissing(db, 'rooms', 'room_type', 'TEXT');
  addColumnIfMissing(db, 'rooms', 'zone', 'TEXT');
  addColumnIfMissing(db, 'rooms', 'sort_key', 'TEXT');
}

function addColumnIfMissing(db: DatabaseSync, tableName: string, columnName: string, columnType: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  if (rows.some((row) => row.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

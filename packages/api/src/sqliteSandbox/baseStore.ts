import {
  type InventoryHorizonRequest,
  type InventoryReadModel,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  pmsSqliteDbPathEnvName,
  type PmsLocalStorageMetadata,
  type PmsSandboxReadback,
  type PmsSandboxReservationImportRecord,
} from '../localSandbox/model.js';
import { cloneValue } from './model.js';
import { migrateSqliteSandboxSchema } from './schema.js';

export interface CreateSqliteLocalSandboxStoreOptions {
  readonly dbPath: string;
  readonly seedRooms?: readonly RoomAggregate[];
  readonly seedReservations?: readonly PmsSandboxReservationImportRecord[];
  readonly resetOnStart?: boolean;
  readonly now?: () => string;
}

export abstract class SqliteSandboxBase {
  readonly storage: PmsLocalStorageMetadata = {
    kind: 'sqlite',
    envName: pmsSqliteDbPathEnvName,
    driver: 'node:sqlite',
    experimental: true,
  };

  protected readonly db: DatabaseSync;
  protected readonly seedRooms: readonly RoomAggregate[];
  protected readonly seedReservations: readonly PmsSandboxReservationImportRecord[];
  protected readonly now: () => string;
  protected transactionDepth = 0;
  protected inventoryDirty = false;

  protected constructor(options: CreateSqliteLocalSandboxStoreOptions) {
    if (options.dbPath !== ':memory:') {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(options.dbPath);
    this.seedRooms = cloneValue(options.seedRooms ?? []);
    this.seedReservations = cloneValue(options.seedReservations ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  abstract reset(
    seedRooms?: readonly RoomAggregate[],
    seedReservations?: readonly PmsSandboxReservationImportRecord[],
  ): PmsSandboxReadback;
  protected abstract listRooms(): RoomAggregate[];
  protected abstract seedCatalogFromRooms(
    rooms: readonly RoomAggregate[],
  ): void;
  protected abstract rebuildInventoryHorizon(
    options?: Partial<InventoryHorizonRequest>,
  ): InventoryReadModel;

  runInTransaction<TValue>(operation: () => TValue): TValue {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.exec('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      const result = operation();
      if (this.inventoryDirty) {
        this.rebuildInventoryHorizon();
        this.inventoryDirty = false;
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.inventoryDirty = false;
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  close(): void {
    this.db.close();
  }

  protected migrate(): void {
    migrateSqliteSandboxSchema(this.db, this.now());
  }

  protected bootstrap(options: CreateSqliteLocalSandboxStoreOptions): void {
    if (options.resetOnStart) {
      this.reset(this.seedRooms);
      return;
    }

    if (this.hasBusinessRows()) {
      this.seedCatalogFromRooms(this.listRooms());
      return;
    }

    this.reset(this.seedRooms);
  }

  protected hasBusinessRows(): boolean {
    const row = this.db
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM properties) +
            (SELECT COUNT(*) FROM room_types) +
            (SELECT COUNT(*) FROM rooms) +
            (SELECT COUNT(*) FROM reservations) +
            (SELECT COUNT(*) FROM reservation_drafts) +
            (SELECT COUNT(*) FROM reservation_cancel_actions) +
            (SELECT COUNT(*) FROM housekeeping_tasks) +
            (SELECT COUNT(*) FROM maintenance_tickets) +
            (SELECT COUNT(*) FROM audits) +
            (SELECT COUNT(*) FROM domain_events) +
            (SELECT COUNT(*) FROM operation_requests) +
            (SELECT COUNT(*) FROM core_idempotency) +
            (SELECT COUNT(*) FROM api_idempotency) AS total
        `,
      )
      .get() as { total: number };
    return row.total > 0;
  }

  protected clearBusinessTables(): void {
    this.db.exec(`
      DELETE FROM projection_dispatch_ledger;
      DELETE FROM api_idempotency;
      DELETE FROM core_idempotency;
      DELETE FROM operation_requests;
      DELETE FROM domain_events;
      DELETE FROM audits;
      DELETE FROM inventory_summary_day_type;
      DELETE FROM inventory_interval_projection;
      DELETE FROM inventory_day_room;
      DELETE FROM inventory_blocks;
      DELETE FROM reservation_group_draft_audits;
      DELETE FROM reservation_group_drafts;
      DELETE FROM reservation_cancel_action_audits;
      DELETE FROM reservation_cancel_actions;
      DELETE FROM reservation_draft_audits;
      DELETE FROM reservation_drafts;
      DELETE FROM stays;
      DELETE FROM reservation_room_allocations;
      DELETE FROM reservations;
      DELETE FROM guest_id_card_drafts;
      DELETE FROM guest_id_cards;
      DELETE FROM guests;
      DELETE FROM maintenance_tickets;
      DELETE FROM housekeeping_tasks;
      DELETE FROM rooms;
      DELETE FROM room_types;
      DELETE FROM properties;
    `);
    this.inventoryDirty = true;
  }
}

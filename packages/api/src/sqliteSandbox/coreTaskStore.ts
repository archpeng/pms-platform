import {
  type HousekeepingTask,
  type MaintenanceTicket,
} from '@pms-platform/contracts';
import { SqliteSandboxCoreCatalogStore } from './coreCatalogStore.js';
import {
  JsonPayloadRow,
  ReservationDraftAuditPayloadRow,
  ReservationGroupDraftAuditPayloadRow,
  parseJson,
} from './model.js';

export abstract class SqliteSandboxCoreTaskStore extends SqliteSandboxCoreCatalogStore {
  protected abstract upsertMaintenanceInventoryBlock(
    ticket: MaintenanceTicket,
  ): void;

  protected getHousekeepingTask(taskId: string): HousekeepingTask | undefined {
    const row = this.db
      .prepare('SELECT payload_json FROM housekeeping_tasks WHERE task_id = ?')
      .get(taskId) as JsonPayloadRow | undefined;
    return row ? parseJson<HousekeepingTask>(row.payload_json) : undefined;
  }

  protected listHousekeepingTasks(): HousekeepingTask[] {
    const rows = this.db
      .prepare(
        'SELECT payload_json FROM housekeeping_tasks ORDER BY created_at, task_id',
      )
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<HousekeepingTask>(row.payload_json));
  }

  protected listHousekeepingTasksByRoomIds(
    roomIds: ReadonlySet<string>,
  ): HousekeepingTask[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listHousekeepingTasks().filter((task) =>
      roomIds.has(task.roomId),
    );
  }

  protected saveHousekeepingTask(task: HousekeepingTask): void {
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
      .run(
        task.taskId,
        task.roomId,
        JSON.stringify(task),
        task.createdAt,
        this.now(),
      );
  }

  protected getMaintenanceTicket(
    ticketId: string,
  ): MaintenanceTicket | undefined {
    const row = this.db
      .prepare(
        'SELECT payload_json FROM maintenance_tickets WHERE ticket_id = ?',
      )
      .get(ticketId) as JsonPayloadRow | undefined;
    return row ? parseJson<MaintenanceTicket>(row.payload_json) : undefined;
  }

  protected listMaintenanceTickets(): MaintenanceTicket[] {
    const rows = this.db
      .prepare(
        'SELECT payload_json FROM maintenance_tickets ORDER BY created_at, ticket_id',
      )
      .all() as unknown as JsonPayloadRow[];
    return rows.map((row) => parseJson<MaintenanceTicket>(row.payload_json));
  }

  protected listMaintenanceTicketsByRoomIds(
    roomIds: ReadonlySet<string>,
  ): MaintenanceTicket[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listMaintenanceTickets().filter((ticket) =>
      roomIds.has(ticket.roomId),
    );
  }

  protected saveMaintenanceTicket(ticket: MaintenanceTicket): void {
    this.db
      .prepare(
        `
          INSERT INTO maintenance_tickets (ticket_id, room_id, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ticket_id) DO UPDATE SET
            room_id = excluded.room_id,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        ticket.ticketId,
        ticket.roomId,
        JSON.stringify(ticket),
        ticket.createdAt,
        this.now(),
      );
    this.upsertMaintenanceInventoryBlock(ticket);
    this.inventoryDirty = true;
  }

  protected getReservationDraftAuditPayload(
    auditId: string,
  ): ReservationDraftAuditPayloadRow | undefined {
    return this.db
      .prepare(
        'SELECT audit_id, draft_id, action, occurred_at, payload_json FROM reservation_draft_audits WHERE audit_id = ?',
      )
      .get(auditId) as ReservationDraftAuditPayloadRow | undefined;
  }

  protected getReservationGroupDraftAuditPayload(
    auditId: string,
  ): ReservationGroupDraftAuditPayloadRow | undefined {
    return this.db
      .prepare(
        'SELECT audit_id, group_draft_id, action, occurred_at, payload_json FROM reservation_group_draft_audits WHERE audit_id = ?',
      )
      .get(auditId) as ReservationGroupDraftAuditPayloadRow | undefined;
  }
}

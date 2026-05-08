import { type MaintenanceTicket } from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
  type CorePorts,
  type DomainEventCollector,
  type IdempotencyRepository,
} from '@pms-platform/core';
import { type ApiIdempotencyRepository } from '../index.js';
import { SqliteSandboxCoreIdempotencyStore } from './coreIdempotencyStore.js';
import { cloneValue } from './model.js';

export abstract class SqliteSandboxCorePortsStore extends SqliteSandboxCoreIdempotencyStore {
  protected abstract closeActiveStopSellBlocks(
    roomId: string,
    timestamp: string,
  ): void;

  protected abstract upsertMaintenanceInventoryBlock(
    ticket: MaintenanceTicket,
  ): void;

  protected createCorePorts(): CorePorts {
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
      maintenanceTickets: {
        get: (ticketId) => cloneValue(this.getMaintenanceTicket(ticketId)),
        save: (ticket) => this.saveMaintenanceTicket(ticket),
        list: () => cloneValue(this.listMaintenanceTickets()),
      },
      audits: {
        append: (entry) => this.appendAudit(entry),
        list: () => cloneValue(this.listAudits()),
      },
      idempotency: this.createCoreIdempotencyRepository(),
      events: this.createDomainEventCollector(),
    };
  }

  protected createCoreIdempotencyRepository(): IdempotencyRepository<
    | CoreCheckInConfirmResult
    | CoreCheckOutConfirmResult
    | CorePmsCommandConfirmResult
  > {
    return {
      get: (idempotencyKey) =>
        cloneValue(this.getCoreIdempotency(idempotencyKey)),
      save: (idempotencyKey, response) =>
        this.saveCoreIdempotency(idempotencyKey, response),
      has: (idempotencyKey) => Boolean(this.getCoreIdempotency(idempotencyKey)),
    };
  }

  protected createDomainEventCollector(): DomainEventCollector {
    return {
      append: (event) => this.appendDomainEvent(event),
      list: () => cloneValue(this.listDomainEvents()),
      clear: () => {
        this.db.prepare('DELETE FROM domain_events').run();
      },
    };
  }

  protected createApiIdempotencyRepository(): ApiIdempotencyRepository {
    return {
      get: (idempotencyKey) =>
        cloneValue(this.getApiIdempotency(idempotencyKey)),
      save: (record) => this.saveApiIdempotency(record),
      list: () => cloneValue(this.listApiIdempotencyRecords()),
    };
  }
}

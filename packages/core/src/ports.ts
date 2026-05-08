import {
  type AuditEntry,
  type DomainEvent,
  type HousekeepingTask,
  type MaintenanceTicket,
} from '@pms-platform/contracts';
import { type RoomAggregate } from './model.js';

export interface RoomRepository {
  get(roomId: string): RoomAggregate | undefined;
  save(room: RoomAggregate): void;
  list(): RoomAggregate[];
}

export interface HousekeepingTaskRepository {
  get(taskId: string): HousekeepingTask | undefined;
  save(task: HousekeepingTask): void;
  list(): HousekeepingTask[];
}

export interface MaintenanceTicketRepository {
  get(ticketId: string): MaintenanceTicket | undefined;
  save(ticket: MaintenanceTicket): void;
  list(): MaintenanceTicket[];
}

export interface AuditRepository {
  append(entry: AuditEntry): void;
  list(): AuditEntry[];
}

export interface IdempotencyRepository<TValue = unknown> {
  get(idempotencyKey: string): TValue | undefined;
  save(idempotencyKey: string, value: TValue): void;
  has(idempotencyKey: string): boolean;
}

export interface DomainEventCollector {
  append(event: DomainEvent): void;
  list(): DomainEvent[];
  clear(): void;
}

export interface CorePorts {
  readonly rooms: RoomRepository;
  readonly housekeepingTasks: HousekeepingTaskRepository;
  readonly maintenanceTickets: MaintenanceTicketRepository;
  readonly audits: AuditRepository;
  readonly idempotency: IdempotencyRepository;
  readonly events: DomainEventCollector;
}

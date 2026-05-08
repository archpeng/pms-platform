import type { Actor } from './actor.js';
import type { CommandSource } from './commandMeta.js';
import type { HousekeepingTask } from './housekeeping.js';
import type { MaintenanceTicket } from './maintenance.js';
import type { RoomStatus } from './room.js';

export interface AuditEntry {
  readonly auditId: string;
  readonly commandType: string;
  readonly roomId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export type DomainErrorCode =
  | 'MISSING_COMMAND_META'
  | 'MISSING_REASON'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'MISSING_CORRELATION_ID'
  | 'MISSING_ACTOR'
  | 'INVALID_REQUESTED_AT'
  | 'INVALID_EXECUTION_MODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NOT_CHECKOUTABLE'
  | 'ROOM_NOT_CHECKIN_ELIGIBLE'
  | 'ROOM_NOT_HOUSEKEEPING_ELIGIBLE'
  | 'ROOM_NOT_MAINTENANCE_ELIGIBLE'
  | 'MAINTENANCE_TICKET_NOT_FOUND'
  | 'ROOM_ALREADY_SELLABLE';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly field?: string;
}

export interface DomainEventBase {
  readonly eventId: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actor: Actor;
}

export interface RoomCheckedInEvent extends DomainEventBase {
  readonly type: 'RoomCheckedIn';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export interface RoomCheckedOutEvent extends DomainEventBase {
  readonly type: 'RoomCheckedOut';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export interface HousekeepingTaskCreatedEvent extends DomainEventBase {
  readonly type: 'HousekeepingTaskCreated';
  readonly aggregateId: string;
  readonly task: HousekeepingTask;
}

export interface HousekeepingCompletedEvent extends DomainEventBase {
  readonly type: 'HousekeepingCompleted' | 'HousekeepingInspectionPassed' | 'HousekeepingInspectionFailed' | 'HousekeepingReworkCompleted';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly task?: HousekeepingTask;
}

export interface MaintenanceTicketEvent extends DomainEventBase {
  readonly type: 'MaintenanceReported' | 'MaintenanceCompleted';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly ticket: MaintenanceTicket;
}

export interface RoomSellabilityRestoredEvent extends DomainEventBase {
  readonly type: 'RoomSellabilityRestored';
  readonly aggregateId: string;
  readonly roomId: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
}

export type DomainEvent =
  | RoomCheckedInEvent
  | RoomCheckedOutEvent
  | HousekeepingTaskCreatedEvent
  | HousekeepingCompletedEvent
  | MaintenanceTicketEvent
  | RoomSellabilityRestoredEvent;

import type { Actor } from './actor.js';
import type { CommandExecutionMode,CommandSource,PmsCommandType } from './commandMeta.js';
import type { DomainEvent } from './domain.js';
import type { HousekeepingTaskKind,HousekeepingTaskStatus } from './housekeeping.js';
import type { MaintenanceSeverity,MaintenanceTicketStatus } from './maintenance.js';
import { pmsProjectionSchemaVersion } from './readModels.js';
import type { RoomStatus } from './room.js';

export interface RoomLedgerProjection {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
  readonly roomCode: string;
  readonly lastActor: Actor;
  readonly lastReason: string;
  readonly lastUpdatedAt: string;
}

export interface HousekeepingTaskProjection {
  readonly taskId: string;
  readonly roomId: string;
  readonly kind: HousekeepingTaskKind;
  readonly status: HousekeepingTaskStatus;
  readonly reason: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface OperationLogProjection {
  readonly auditId: string;
  readonly commandType: PmsCommandType;
  readonly roomId: string;
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly domainEventTypes: readonly DomainEvent['type'][];
}

export interface MaintenanceTicketProjection {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly severity: MaintenanceSeverity;
  readonly reason: string;
  readonly stopSellRequested: boolean;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface CommandProjection {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly commandType: PmsCommandType;
  readonly mode: Extract<CommandExecutionMode, 'confirm'>;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly roomLedger: RoomLedgerProjection;
  readonly housekeepingTask?: HousekeepingTaskProjection;
  readonly maintenanceTicket?: MaintenanceTicketProjection;
  readonly operationLog: OperationLogProjection;
}

export interface DeferredPmsCommandStub {
  readonly commandType: Extract<PmsCommandType, 'HOUSEKEEPING_DONE' | 'REPORT_MAINTENANCE'>;
  readonly status: 'contract-stub';
  readonly owner: 'pms-platform';
  readonly mutationStatus: 'deferred';
  readonly reason: string;
}

export const deferredPmsCommandStubs: readonly DeferredPmsCommandStub[] = [];

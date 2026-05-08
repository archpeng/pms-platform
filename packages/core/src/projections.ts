import {
  pmsProjectionSchemaVersion,
  type AuditEntry,
  type CommandProjection,
  type DomainEvent,
  type HousekeepingTask,
  type HousekeepingTaskProjection,
  type MaintenanceTicket,
  type MaintenanceTicketProjection,
  type OperationLogProjection,
  type PmsCommandType,
  type RoomLedgerProjection,
  type RoomStatus,
} from '@pms-platform/contracts';
import { deriveRoomCode } from './model.js';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
} from './results.js';

export function buildCheckInProjection(result: CoreCheckInConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_IN',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
  });
}

export function buildCheckOutProjection(result: CoreCheckOutConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: 'CHECK_OUT',
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
    housekeepingTask: result.housekeepingTask,
  });
}

export function buildPmsCommandProjection(result: CorePmsCommandConfirmResult): CommandProjection {
  return buildCommandProjection({
    commandType: result.commandType,
    roomId: result.roomId,
    roomNumber: result.roomNumber,
    roomType: result.roomType,
    zone: result.zone,
    sortKey: result.sortKey,
    status: result.nextStatus,
    auditEntry: result.auditEntry,
    events: result.events,
    housekeepingTask: result.housekeepingTask,
    maintenanceTicket: result.maintenanceTicket,
  });
}

function buildCommandProjection(input: {
  readonly commandType: PmsCommandType;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
  readonly housekeepingTask?: HousekeepingTask;
  readonly maintenanceTicket?: MaintenanceTicket;
}): CommandProjection {
  const roomLedger: RoomLedgerProjection = {
    schemaVersion: pmsProjectionSchemaVersion,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    ...(input.roomType ? { roomType: input.roomType } : {}),
    ...(input.zone ? { zone: input.zone } : {}),
    ...(input.sortKey ? { sortKey: input.sortKey } : {}),
    status: { ...input.status },
    roomCode: deriveRoomCode({
      roomNumber: input.roomNumber,
      occupancyStatus: input.status.occupancy,
      cleaningStatus: input.status.cleaning,
      saleStatus: input.status.sale,
    }),
    lastActor: { ...input.auditEntry.actor },
    lastReason: input.auditEntry.reason,
    lastUpdatedAt: input.auditEntry.occurredAt,
  };
  const housekeepingTask: HousekeepingTaskProjection | undefined = input.housekeepingTask
    ? { ...input.housekeepingTask }
    : undefined;
  const maintenanceTicket: MaintenanceTicketProjection | undefined = input.maintenanceTicket
    ? { ...input.maintenanceTicket }
    : undefined;
  const operationLog: OperationLogProjection = {
    auditId: input.auditEntry.auditId,
    commandType: input.commandType,
    roomId: input.auditEntry.roomId,
    actor: { ...input.auditEntry.actor },
    source: input.auditEntry.source,
    reason: input.auditEntry.reason,
    idempotencyKey: input.auditEntry.idempotencyKey,
    correlationId: input.auditEntry.correlationId,
    occurredAt: input.auditEntry.occurredAt,
    domainEventTypes: input.events.map((event) => event.type),
  };

  return {
    schemaVersion: pmsProjectionSchemaVersion,
    commandType: input.commandType,
    mode: 'confirm',
    correlationId: input.auditEntry.correlationId,
    idempotencyKey: input.auditEntry.idempotencyKey,
    roomLedger,
    ...(housekeepingTask ? { housekeepingTask } : {}),
    ...(maintenanceTicket ? { maintenanceTicket } : {}),
    operationLog,
  };
}

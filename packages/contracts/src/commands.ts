import type { Actor } from './actor.js';
import type { CommandMeta,PmsCommandType } from './commandMeta.js';
import type { DomainEvent } from './domain.js';
import type { HousekeepingTask } from './housekeeping.js';
import type { MaintenanceSeverity,MaintenanceTicket } from './maintenance.js';
import type { OccupancyStatus,RoomStatus } from './room.js';

export interface CheckInCommand {
  readonly type: 'CHECK_IN';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly overrideDirtyRoom?: boolean;
  readonly meta: CommandMeta;
}

export interface CheckOutCommand {
  readonly type: 'CHECK_OUT';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly meta: CommandMeta;
}

export interface HousekeepingDoneCommand {
  readonly type: 'HOUSEKEEPING_DONE';
  readonly roomId: string;
  readonly inspectionRequired?: boolean;
  readonly meta: CommandMeta;
}

export interface HousekeepingInspectionCommand {
  readonly type: 'HOUSEKEEPING_INSPECTION';
  readonly roomId: string;
  readonly result: 'pass' | 'fail';
  readonly taskId?: string;
  readonly meta: CommandMeta;
}

export interface HousekeepingReworkCommand {
  readonly type: 'HOUSEKEEPING_REWORK';
  readonly roomId: string;
  readonly inspectionRequired?: boolean;
  readonly taskId?: string;
  readonly meta: CommandMeta;
}

// Operator-driven adhoc transition from `clean` to `dirty` (e.g. staff spots an issue post-cleaning,
// guest reports a problem). Only valid when the room is currently clean; the matching cleanup will
// arrive via HOUSEKEEPING_DONE. Emits a HousekeepingMarkedDirty event for audit, no new task.
export interface HousekeepingMarkDirtyCommand {
  readonly type: 'HOUSEKEEPING_MARK_DIRTY';
  readonly roomId: string;
  readonly meta: CommandMeta;
}

export interface ReportMaintenanceCommand {
  readonly type: 'REPORT_MAINTENANCE';
  readonly roomId: string;
  readonly severity?: MaintenanceSeverity;
  readonly stopSellRequested?: boolean;
  readonly note?: string;
  readonly meta: CommandMeta;
}

export interface MaintenanceDoneCommand {
  readonly type: 'MAINTENANCE_DONE';
  readonly roomId: string;
  readonly ticketId?: string;
  readonly note?: string;
  readonly meta: CommandMeta;
}

export interface RestoreSellableCommand {
  readonly type: 'RESTORE_SELLABLE';
  readonly roomId: string;
  readonly meta: CommandMeta;
}

export interface CheckInDryRunPlan {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly overrideDirtyRoom: boolean;
  readonly warnings: readonly string[];
  readonly events: ReadonlyArray<'RoomCheckedIn'>;
}

export interface CheckOutDryRunPlan {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: Omit<HousekeepingTask, 'taskId' | 'createdAt' | 'status'> & {
    readonly status: 'pending';
  };
  readonly events: ReadonlyArray<'RoomCheckedOut' | 'HousekeepingTaskCreated'>;
}

export interface PmsCommandDryRunPlan {
  readonly commandType: Exclude<PmsCommandType, 'CHECK_IN' | 'CHECK_OUT'>;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly currentStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask?: Omit<HousekeepingTask, 'taskId' | 'createdAt'>;
  readonly maintenanceTicket?: Omit<MaintenanceTicket, 'ticketId' | 'createdAt'>;
  readonly events: readonly DomainEvent['type'][];
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export const checkoutableOccupancyStatuses: ReadonlyArray<OccupancyStatus> = ['occupied', 'dueOut'];

export const checkInNextStatus: RoomStatus = {
  occupancy: 'occupied',
  cleaning: 'clean',
  sale: 'sellable',
};

export const checkoutNextStatus: RoomStatus = {
  occupancy: 'vacant',
  cleaning: 'dirty',
  sale: 'sellable',
};

import {
  type Actor,
  type AuditEntry,
  type CheckInDryRunPlan,
  type CheckOutDryRunPlan,
  type CommandExecutionMode,
  type DomainError,
  type DomainEvent,
  type HousekeepingTask,
  type MaintenanceTicket,
  type PmsCommandDryRunPlan,
  type PmsCommandType,
  type RoomStatus,
} from '@pms-platform/contracts';

export interface CoreCheckInDryRunPlan extends CheckInDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckInConfirmResult {
  readonly commandType: 'CHECK_IN';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export interface CoreCheckOutDryRunPlan extends CheckOutDryRunPlan {
  readonly roomNumber: string;
  readonly reason: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Actor;
}

export interface CoreCheckOutConfirmResult {
  readonly commandType: 'CHECK_OUT';
  readonly roomId: string;
  readonly roomNumber: string;
  readonly reservationId?: string;
  readonly reservationCode?: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask: HousekeepingTask;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export interface CorePmsCommandConfirmResult {
  readonly commandType: Exclude<PmsCommandType, 'CHECK_IN' | 'CHECK_OUT'>;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly previousStatus: RoomStatus;
  readonly nextStatus: RoomStatus;
  readonly housekeepingTask?: HousekeepingTask;
  readonly maintenanceTicket?: MaintenanceTicket;
  readonly auditEntry: AuditEntry;
  readonly events: readonly DomainEvent[];
}

export type CheckInResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckInDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckInConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export type CheckOutResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: CoreCheckOutDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CoreCheckOutConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

export type PmsCommandResult =
  | {
      readonly ok: true;
      readonly mode: 'dryRun';
      readonly plan: PmsCommandDryRunPlan;
    }
  | {
      readonly ok: true;
      readonly mode: 'confirm';
      readonly result: CorePmsCommandConfirmResult;
    }
  | {
      readonly ok: false;
      readonly mode: CommandExecutionMode | 'unsupported';
      readonly errors: readonly DomainError[];
    };

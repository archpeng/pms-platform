import type { Actor } from './actor.js';

export type CommandSource = 'pms-core' | 'api' | 'mcp' | 'worker' | 'test';

export type CommandExecutionMode = 'dryRun' | 'confirm';

export type PmsCommandType =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'HOUSEKEEPING_DONE'
  | 'HOUSEKEEPING_INSPECTION'
  | 'HOUSEKEEPING_REWORK'
  | 'HOUSEKEEPING_MARK_DIRTY'
  | 'REPORT_MAINTENANCE'
  | 'MAINTENANCE_DONE'
  | 'RESTORE_SELLABLE';

export interface CommandMeta {
  readonly actor: Actor;
  readonly source: CommandSource;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly mode: CommandExecutionMode;
}

import {
  type CheckOutCommand,
  type CommandExecutionMode,
  type PmsCommandType,
} from '@pms-platform/contracts';

export const corePackageName = '@pms-platform/core';

export interface CoreContractBoundaryCheck {
  readonly packageName: typeof corePackageName;
  readonly supportedCommandType: CheckOutCommand['type'];
  readonly supportedCommandTypes: readonly PmsCommandType[];
  readonly supportedReadModels: readonly ['pms_get_room', 'pms_dashboard'];
  readonly supportedExecutionModes: readonly CommandExecutionMode[];
}

export const supportedExecutionModes: readonly CommandExecutionMode[] = ['dryRun', 'confirm'];

export function describeCoreContractBoundary(): CoreContractBoundaryCheck {
  return {
    packageName: corePackageName,
    supportedCommandType: 'CHECK_OUT',
    supportedCommandTypes: [
      'CHECK_IN',
      'CHECK_OUT',
      'HOUSEKEEPING_DONE',
      'HOUSEKEEPING_INSPECTION',
      'HOUSEKEEPING_REWORK',
      'REPORT_MAINTENANCE',
      'MAINTENANCE_DONE',
      'RESTORE_SELLABLE',
    ],
    supportedReadModels: ['pms_get_room', 'pms_dashboard'],
    supportedExecutionModes,
  };
}

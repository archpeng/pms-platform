import type {
  CheckOutApiRequest,
  CheckOutApiResponse,
  CheckOutConfirmApiRequest,
  CheckOutDryRunApiRequest,
  ExecuteCheckOutApiOptions,
} from '@pms-platform/api';
import { executeCheckOutApiRequest, pmsCheckOutOperation } from '@pms-platform/api';
import type { CheckOutCommand, CommandMeta } from '@pms-platform/contracts';
import type { CheckOutResult, CorePorts } from '@pms-platform/core';
import type { ApiErrorCode } from '@pms-platform/api';

export const mcpPackageName = '@pms-platform/mcp';
export const pmsCheckOutToolName = pmsCheckOutOperation;

export type PmsCheckOutToolRequest = CheckOutApiRequest;
export type PmsCheckOutDryRunToolRequest = CheckOutDryRunApiRequest;
export type PmsCheckOutConfirmToolRequest = CheckOutConfirmApiRequest;
export type PmsCheckOutToolResponse = CheckOutApiResponse;
export type PmsCheckOutToolOptions = ExecuteCheckOutApiOptions;

export interface PmsCheckOutToolInputSchema {
  readonly name: typeof pmsCheckOutToolName;
  readonly commandType: CheckOutCommand['type'];
  readonly requiredFields: readonly [
    'operation',
    'mode',
    'roomId',
    'actor',
    'source',
    'reason',
    'idempotencyKey',
    'correlationId',
    'requestedAt',
    'requestFingerprint',
  ];
  readonly modes: readonly ['dryRun', 'confirm'];
  readonly stableErrorPassthrough: readonly ApiErrorCode[];
  readonly mutatingModeRequiresExplicitConfirm: true;
}

export interface PmsCheckOutToolContract {
  readonly packageName: typeof mcpPackageName;
  readonly name: typeof pmsCheckOutToolName;
  readonly description: string;
  readonly inputSchema: PmsCheckOutToolInputSchema;
  readonly resultShape: CheckOutResult;
  readonly responseShape: PmsCheckOutToolResponse;
}

export const pmsCheckOutToolInputSchema: PmsCheckOutToolInputSchema = {
  name: pmsCheckOutToolName,
  commandType: 'CHECK_OUT',
  requiredFields: [
    'operation',
    'mode',
    'roomId',
    'actor',
    'source',
    'reason',
    'idempotencyKey',
    'correlationId',
    'requestedAt',
    'requestFingerprint',
  ],
  modes: ['dryRun', 'confirm'],
  stableErrorPassthrough: [
    'MISSING_COMMAND_META',
    'MISSING_REASON',
    'MISSING_IDEMPOTENCY_KEY',
    'MISSING_CORRELATION_ID',
    'MISSING_ACTOR',
    'INVALID_REQUESTED_AT',
    'INVALID_EXECUTION_MODE',
    'ROOM_NOT_FOUND',
    'ROOM_NOT_CHECKOUTABLE',
    'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT',
  ],
  mutatingModeRequiresExplicitConfirm: true,
};

export const pmsCheckOutToolContract: PmsCheckOutToolContract = {
  packageName: mcpPackageName,
  name: pmsCheckOutToolName,
  description: 'Dry-run or explicitly confirm a PMS CHECK_OUT command through PMS-owned API/Core boundaries.',
  inputSchema: pmsCheckOutToolInputSchema,
  resultShape: undefined as never,
  responseShape: undefined as never,
};

export function executePmsCheckOutTool(
  request: PmsCheckOutToolRequest,
  ports: CorePorts,
  options: PmsCheckOutToolOptions = {},
): PmsCheckOutToolResponse {
  return executeCheckOutApiRequest(request, ports, options);
}

export function describePmsCheckOutToolContract() {
  return {
    packageName: mcpPackageName,
    name: pmsCheckOutToolName,
    commandType: 'CHECK_OUT' as const,
    modes: pmsCheckOutToolInputSchema.modes,
    requiredFields: pmsCheckOutToolInputSchema.requiredFields,
    mutatingModeRequiresExplicitConfirm: pmsCheckOutToolInputSchema.mutatingModeRequiresExplicitConfirm,
    importsApiBoundary: true,
    exposesLocalHandler: true,
  };
}

export function isConfirmToolRequest(request: PmsCheckOutToolRequest): request is PmsCheckOutConfirmToolRequest {
  return request.mode === 'confirm';
}

export function sourceForToolRequest(request: PmsCheckOutToolRequest): CommandMeta['source'] {
  return request.source;
}

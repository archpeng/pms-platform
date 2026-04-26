import { describe, expect, it } from 'vitest';
import { pmsCheckOutOperation, type ApiErrorCode, type CheckOutApiResponse } from '@pms-platform/api';
import { checkoutContractFixtures } from '@pms-platform/contracts';
import type { CheckOutResult } from '@pms-platform/core';
import {
  describePmsCheckOutToolContract,
  isConfirmToolRequest,
  pmsCheckOutToolContract,
  pmsCheckOutToolInputSchema,
  pmsCheckOutToolName,
  sourceForToolRequest,
  type PmsCheckOutConfirmToolRequest,
  type PmsCheckOutDryRunToolRequest,
  type PmsCheckOutToolResponse,
} from '../src/index.js';

const dryRunToolRequest: PmsCheckOutDryRunToolRequest = {
  operation: pmsCheckOutOperation,
  mode: 'dryRun',
  roomId: 'room-1001',
  actor: checkoutContractFixtures.actor,
  source: 'mcp',
  reason: checkoutContractFixtures.dryRunCommand.meta.reason,
  idempotencyKey: checkoutContractFixtures.dryRunCommand.meta.idempotencyKey,
  correlationId: checkoutContractFixtures.dryRunCommand.meta.correlationId,
  requestedAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
  requestFingerprint: 'sha256:mcp-dry-run',
};

describe('MCP pms_check_out contract skeleton', () => {
  it('defines the pms_check_out tool without a server runtime or transport', () => {
    expect(pmsCheckOutToolName).toBe('pms_check_out');
    expect(describePmsCheckOutToolContract()).toEqual({
      packageName: '@pms-platform/mcp',
      name: 'pms_check_out',
      commandType: 'CHECK_OUT',
      modes: ['dryRun', 'confirm'],
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
      mutatingModeRequiresExplicitConfirm: true,
      importsApiBoundary: true,
      exposesLocalHandler: true,
    });
    expect(pmsCheckOutToolContract.description).toContain('PMS-owned API/Core boundaries');
  });

  it('requires explicit dry-run or confirm request modes', () => {
    const confirmToolRequest: PmsCheckOutConfirmToolRequest = {
      ...dryRunToolRequest,
      mode: 'confirm',
      requestFingerprint: 'sha256:mcp-confirm',
    };

    expect(isConfirmToolRequest(dryRunToolRequest)).toBe(false);
    expect(isConfirmToolRequest(confirmToolRequest)).toBe(true);
    expect(sourceForToolRequest(confirmToolRequest)).toBe('mcp');
  });

  it('advertises stable PMS error passthrough from contracts/core', () => {
    expect(pmsCheckOutToolInputSchema.stableErrorPassthrough).toEqual<readonly ApiErrorCode[]>([
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
    ]);

    const coreFailure: Extract<CheckOutResult, { ok: false }> = {
      ok: false,
      mode: 'dryRun',
      errors: [checkoutContractFixtures.stableFailure],
    };
    const toolFailure: PmsCheckOutToolResponse = coreFailure satisfies CheckOutApiResponse;

    expect(toolFailure).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [checkoutContractFixtures.stableFailure],
    });
  });
});

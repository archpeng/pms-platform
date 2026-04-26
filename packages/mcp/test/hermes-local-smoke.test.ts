import { describe, expect, it } from 'vitest';
import { pmsCheckOutOperation } from '@pms-platform/api';
import { checkoutContractFixtures } from '@pms-platform/contracts';
import { createInMemoryCorePorts, type RoomAggregate } from '@pms-platform/core';
import { executePmsCheckOutTool, type PmsCheckOutConfirmToolRequest, type PmsCheckOutDryRunToolRequest } from '../src/index.js';

const room: RoomAggregate = {
  roomId: 'room-hermes-1001',
  roomNumber: '1001',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

function hermesDryRunRequest(): PmsCheckOutDryRunToolRequest {
  return {
    operation: pmsCheckOutOperation,
    mode: 'dryRun',
    roomId: room.roomId,
    actor: {
      type: 'ai',
      id: 'hermes-local-smoke',
      displayName: 'Hermes Local Smoke',
    },
    source: 'mcp',
    reason: 'Front desk asks Hermes to prepare checkout preview.',
    idempotencyKey: 'hermes-local-checkout-1001',
    correlationId: 'corr-hermes-local-checkout-1001',
    requestedAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
    requestFingerprint: 'sha256:hermes-local-dry-run',
  };
}

describe('Hermes local PMS tool smoke', () => {
  it('shows Hermes can request checkout dry-run and receive structured PMS output', () => {
    const ports = createInMemoryCorePorts([room]);
    const response = executePmsCheckOutTool(hermesDryRunRequest(), ports);

    expect(response).toMatchObject({
      ok: true,
      operation: 'pms_check_out',
      mode: 'dryRun',
      plan: {
        roomId: 'room-hermes-1001',
        roomNumber: '1001',
        currentStatus: {
          occupancy: 'dueOut',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
      },
    });
    expect(ports.rooms.get(room.roomId)?.occupancyStatus).toBe('dueOut');
  });

  it('shows confirm can execute only with explicit confirmation metadata', () => {
    const ports = createInMemoryCorePorts([room]);
    const dryRun = hermesDryRunRequest();
    const confirm: PmsCheckOutConfirmToolRequest = {
      ...dryRun,
      mode: 'confirm',
      reason: 'Human confirmed checkout after reviewing the dry-run card preview.',
      requestFingerprint: 'sha256:hermes-local-confirm',
    };

    const response = executePmsCheckOutTool(confirm, ports);

    expect(response).toMatchObject({
      ok: true,
      operation: 'pms_check_out',
      mode: 'confirm',
      result: {
        commandType: 'CHECK_OUT',
        roomId: 'room-hermes-1001',
      },
    });
    expect(ports.rooms.get(room.roomId)?.occupancyStatus).toBe('vacant');
    expect(ports.audits.list()[0]).toMatchObject({
      actor: {
        type: 'ai',
        id: 'hermes-local-smoke',
      },
      source: 'mcp',
      correlationId: 'corr-hermes-local-checkout-1001',
    });
  });
});

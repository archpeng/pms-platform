import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutContractFixtures } from '@pms-platform/contracts';
import {
  createInMemoryCorePorts,
  type CoreCheckOutConfirmResult,
  type CoreCheckOutDryRunPlan,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  createInMemoryApiIdempotencyRepository,
  describeApiContractBoundary,
  executeCheckOutApiRequest,
  pmsCheckOutOperation,
  requestFingerprintInput,
  toCheckOutApiResponse,
  toCheckOutCommand,
  type ApiError,
  type CheckOutApiResponse,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
} from '../src/index.js';

const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const dryRunRequest: CheckOutDryRunApiRequest = {
  operation: pmsCheckOutOperation,
  mode: 'dryRun',
  roomId: checkoutContractFixtures.dryRunCommand.roomId,
  actor: checkoutContractFixtures.actor,
  source: 'api',
  reason: checkoutContractFixtures.dryRunCommand.meta.reason,
  idempotencyKey: checkoutContractFixtures.dryRunCommand.meta.idempotencyKey,
  correlationId: checkoutContractFixtures.dryRunCommand.meta.correlationId,
  requestedAt: checkoutContractFixtures.dryRunCommand.meta.requestedAt,
  requestFingerprint: 'sha256:dry-run-fingerprint',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  requestFingerprint: 'sha256:confirm-fingerprint',
};

describe('API checkout contract skeleton', () => {
  it('imports PMS contracts/core types through package boundaries', () => {
    expect(describeApiContractBoundary()).toEqual({
      packageName: '@pms-platform/api',
      operation: 'pms_check_out',
      importsCoreResult: true,
      exposesLocalHandler: true,
      supportedModes: ['dryRun', 'confirm'],
    });

    expect(toCheckOutCommand(dryRunRequest)).toEqual(checkoutContractFixtures.dryRunCommand);
  });

  it('defines explicit dry-run and confirm request shapes with request fingerprints', () => {
    expect(requestFingerprintInput(dryRunRequest)).toEqual({
      operation: 'pms_check_out',
      mode: 'dryRun',
      roomId: 'room-1001',
      actor: checkoutContractFixtures.actor,
      source: 'api',
      reason: 'Guest departed and returned room cards.',
      correlationId: 'corr-checkout-room-1001',
      requestedAt: '2026-04-25T00:00:00.000Z',
    });
    expect(requestFingerprintInput(confirmRequest)).toMatchObject({
      operation: 'pms_check_out',
      mode: 'confirm',
      roomId: 'room-1001',
    });
  });

  it('passes through stable PMS Core success and error response shapes', () => {
    const plan = {
      commandType: 'CHECK_OUT',
      roomId: 'room-1001',
      roomNumber: '1001',
      currentStatus: checkoutContractFixtures.room.status,
      nextStatus: {
        occupancy: 'vacant',
        cleaning: 'dirty',
        sale: 'sellable',
      },
      housekeepingTask: {
        roomId: 'room-1001',
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: dryRunRequest.reason,
        correlationId: dryRunRequest.correlationId,
      },
      events: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
      reason: dryRunRequest.reason,
      correlationId: dryRunRequest.correlationId,
      idempotencyKey: dryRunRequest.idempotencyKey,
      requestedAt: dryRunRequest.requestedAt,
      actor: dryRunRequest.actor,
    } satisfies CoreCheckOutDryRunPlan;

    const dryRunResponse: CheckOutApiResponse = {
      ok: true,
      operation: 'pms_check_out',
      mode: 'dryRun',
      request: {
        idempotencyKey: dryRunRequest.idempotencyKey,
        requestFingerprint: dryRunRequest.requestFingerprint,
        fingerprintInput: requestFingerprintInput(dryRunRequest),
      },
      plan,
    };

    const stableFailure: CheckOutApiResponse = {
      ok: false,
      mode: 'dryRun',
      errors: [checkoutContractFixtures.stableFailure],
    };

    const confirmResult = {
      commandType: 'CHECK_OUT',
      roomId: 'room-1001',
      roomNumber: '1001',
      previousStatus: checkoutContractFixtures.room.status,
      nextStatus: plan.nextStatus,
      housekeepingTask: {
        taskId: 'task-checkout-1',
        roomId: 'room-1001',
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: dryRunRequest.reason,
        correlationId: dryRunRequest.correlationId,
        createdAt: dryRunRequest.requestedAt,
      },
      auditEntry: {
        auditId: 'audit-checkout-1',
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        actor: dryRunRequest.actor,
        source: dryRunRequest.source,
        reason: dryRunRequest.reason,
        idempotencyKey: dryRunRequest.idempotencyKey,
        correlationId: dryRunRequest.correlationId,
        occurredAt: dryRunRequest.requestedAt,
      },
      events: [],
    } satisfies CoreCheckOutConfirmResult;

    expect(dryRunResponse).toMatchObject({ ok: true, mode: 'dryRun', operation: 'pms_check_out' });
    expect(stableFailure.errors).toEqual<readonly ApiError[]>([checkoutContractFixtures.stableFailure]);
    expect(confirmResult.commandType).toBe('CHECK_OUT');
  });

  it('maps PMS Core results into API responses without translating domain errors', () => {
    const result = executeCheckOutApiRequest(dryRunRequest, createInMemoryCorePorts([dueOutRoom]));

    expect(result).toMatchObject({
      ok: true,
      operation: 'pms_check_out',
      mode: 'dryRun',
      plan: {
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        nextStatus: {
          occupancy: 'vacant',
          cleaning: 'dirty',
          sale: 'sellable',
        },
      },
    });

    const invalid = executeCheckOutApiRequest(
      {
        ...dryRunRequest,
        reason: ' ',
      },
      createInMemoryCorePorts([dueOutRoom]),
    );
    expect(invalid).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [checkoutContractFixtures.stableFailure],
    });
  });

  it('executes confirm through PMS Core and preserves result structure', () => {
    const ports = createInMemoryCorePorts([dueOutRoom]);
    const result = executeCheckOutApiRequest(confirmRequest, ports);

    expect(result).toMatchObject({
      ok: true,
      operation: 'pms_check_out',
      mode: 'confirm',
      result: {
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        previousStatus: {
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
    expect(ports.rooms.get('room-1001')?.occupancyStatus).toBe('vacant');
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.events.list().map((event) => event.type)).toEqual(['RoomCheckedOut', 'HousekeepingTaskCreated']);
  });

  it('guards duplicate idempotency keys with request fingerprints at the API boundary', () => {
    const ports = createInMemoryCorePorts([dueOutRoom]);
    const idempotency = createInMemoryApiIdempotencyRepository();
    const first = executeCheckOutApiRequest(confirmRequest, ports, { idempotency });
    const repeated = executeCheckOutApiRequest(confirmRequest, ports, { idempotency });
    const incompatible = executeCheckOutApiRequest(
      {
        ...confirmRequest,
        reason: 'Different payload with the same idempotency key.',
        requestFingerprint: 'sha256:different-payload',
      },
      ports,
      { idempotency },
    );

    expect(first).toEqual(repeated);
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
    expect(incompatible).toEqual({
      ok: false,
      mode: 'confirm',
      errors: [
        {
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT',
          message: 'The idempotency key was reused with a different request fingerprint.',
          field: 'requestFingerprint',
        },
      ],
    });
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
  });

  it('returns stable PMS Core errors for invalid room state', () => {
    const result = executeCheckOutApiRequest(dryRunRequest, createInMemoryCorePorts([{ ...dueOutRoom, occupancyStatus: 'vacant' }]));

    expect(result).toEqual({
      ok: false,
      mode: 'dryRun',
      errors: [
        {
          code: 'ROOM_NOT_CHECKOUTABLE',
          message: 'Room is not in a checkoutable occupancy state.',
          field: 'room.occupancyStatus',
        },
      ],
    });
  });

  it('keeps PMS core/contracts free of Feishu, Hermes, and adapter runtime imports', () => {
    const coreSource = readFileSync(resolve('packages/core/src/index.ts'), 'utf8');
    const contractsSource = readFileSync(resolve('packages/contracts/src/index.ts'), 'utf8');

    for (const forbidden of ['@larksuite', 'adapter-feishu', 'hermes', 'feishu']) {
      expect(coreSource.toLowerCase()).not.toContain(forbidden);
      expect(contractsSource.toLowerCase()).not.toContain(forbidden);
    }
  });
});

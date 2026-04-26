import { describe, expect, it } from 'vitest';
import {
  checkoutContractFixtures,
  checkoutNextStatus,
  type CheckOutCommand,
  type CheckOutDryRunPlan,
  type CommandMeta,
  type DomainError,
  type DomainEvent,
  type HousekeepingTaskCreatedEvent,
  type RoomCheckedOutEvent,
  validateCommandMeta,
} from '../src/index.js';

const validMeta: CommandMeta = checkoutContractFixtures.dryRunCommand.meta;

describe('PMS command contracts', () => {
  it('requires actor/source/reason/idempotency/correlation/requestedAt/mode metadata', () => {
    expect(validateCommandMeta(validMeta)).toEqual([]);

    expect(
      validateCommandMeta({
        ...validMeta,
        reason: ' ',
        idempotencyKey: '',
        correlationId: '',
        requestedAt: 'not-a-date',
        mode: 'invalid' as CommandMeta['mode'],
      }),
    ).toEqual<DomainError[]>([
      {
        code: 'MISSING_REASON',
        message: 'A reason is required for mutating PMS commands.',
        field: 'meta.reason',
      },
      {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'An idempotency key is required for mutating PMS commands.',
        field: 'meta.idempotencyKey',
      },
      {
        code: 'MISSING_CORRELATION_ID',
        message: 'A correlation id is required for command tracing.',
        field: 'meta.correlationId',
      },
      {
        code: 'INVALID_REQUESTED_AT',
        message: 'requestedAt must be an ISO-8601 timestamp.',
        field: 'meta.requestedAt',
      },
      {
        code: 'INVALID_EXECUTION_MODE',
        message: 'Command mode must be dryRun or confirm.',
        field: 'meta.mode',
      },
    ]);
  });

  it('defines the checkout command and dry-run plan shape', () => {
    const command: CheckOutCommand = checkoutContractFixtures.dryRunCommand;
    const dryRunPlan: CheckOutDryRunPlan = {
      commandType: 'CHECK_OUT',
      roomId: command.roomId,
      currentStatus: checkoutContractFixtures.room.status,
      nextStatus: checkoutNextStatus,
      housekeepingTask: {
        roomId: command.roomId,
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: command.meta.reason,
        correlationId: command.meta.correlationId,
      },
      events: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
    };

    expect(dryRunPlan).toMatchObject({
      commandType: 'CHECK_OUT',
      roomId: 'room-1001',
      nextStatus: {
        occupancy: 'vacant',
        cleaning: 'dirty',
      },
      housekeepingTask: {
        kind: 'checkout-cleaning',
        status: 'pending',
      },
    });
  });

  it('defines stable domain event payload shapes', () => {
    const roomCheckedOut: RoomCheckedOutEvent = {
      eventId: 'evt-room-checked-out-1',
      type: 'RoomCheckedOut',
      aggregateId: 'room-1001',
      roomId: 'room-1001',
      previousStatus: checkoutContractFixtures.room.status,
      nextStatus: checkoutNextStatus,
      occurredAt: validMeta.requestedAt,
      correlationId: validMeta.correlationId,
      idempotencyKey: validMeta.idempotencyKey,
      actor: validMeta.actor,
    };

    const taskCreated: HousekeepingTaskCreatedEvent = {
      eventId: 'evt-task-created-1',
      type: 'HousekeepingTaskCreated',
      aggregateId: 'task-1',
      task: {
        taskId: 'task-1',
        roomId: 'room-1001',
        kind: 'checkout-cleaning',
        status: 'pending',
        reason: validMeta.reason,
        correlationId: validMeta.correlationId,
        createdAt: validMeta.requestedAt,
      },
      occurredAt: validMeta.requestedAt,
      correlationId: validMeta.correlationId,
      idempotencyKey: validMeta.idempotencyKey,
      actor: validMeta.actor,
    };

    const events: DomainEvent[] = [roomCheckedOut, taskCreated];

    expect(events.map((event) => event.type)).toEqual(['RoomCheckedOut', 'HousekeepingTaskCreated']);
    expect(events.every((event) => event.correlationId === validMeta.correlationId)).toBe(true);
  });
});

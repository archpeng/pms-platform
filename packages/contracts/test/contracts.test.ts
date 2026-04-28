import { describe, expect, it } from 'vitest';
import {
  checkinContractFixtures,
  checkInNextStatus,
  checkoutContractFixtures,
  checkoutNextStatus,
  deferredPmsCommandStubs,
  pmsProjectionSchemaVersion,
  type CheckInCommand,
  type CheckInDryRunPlan,
  type CheckOutCommand,
  type CheckOutDryRunPlan,
  type CommandMeta,
  type CommandProjection,
  type DashboardReadModel,
  type DomainError,
  type DomainEvent,
  type HousekeepingTaskCreatedEvent,
  type RoomCheckedInEvent,
  type RoomCheckedOutEvent,
  type RoomReadModel,
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

  it('defines the check-in command and dry-run plan shape', () => {
    const command: CheckInCommand = checkinContractFixtures.dryRunCommand;
    const dryRunPlan: CheckInDryRunPlan = {
      commandType: 'CHECK_IN',
      roomId: command.roomId,
      currentStatus: checkinContractFixtures.room.status,
      nextStatus: checkInNextStatus,
      overrideDirtyRoom: false,
      warnings: [],
      events: ['RoomCheckedIn'],
    };

    expect(dryRunPlan).toMatchObject({
      commandType: 'CHECK_IN',
      roomId: 'room-1003',
      nextStatus: {
        occupancy: 'occupied',
        cleaning: 'clean',
        sale: 'sellable',
      },
    });
  });

  it('defines PMS-owned room/dashboard read models and command projection shapes', () => {
    const roomReadModel: RoomReadModel = {
      schemaVersion: pmsProjectionSchemaVersion,
      generatedAt: validMeta.requestedAt,
      summaryStatus: 'fresh',
      room: checkoutContractFixtures.room,
      activeReservation: undefined,
      housekeepingTasks: [],
      maintenanceTickets: [],
      projectionFreshness: {
        status: 'fresh',
        generatedAt: validMeta.requestedAt,
        note: 'pms-read-model-current',
      },
    };
    const dashboardReadModel: DashboardReadModel = {
      schemaVersion: pmsProjectionSchemaVersion,
      generatedAt: validMeta.requestedAt,
      summaryStatus: 'fresh',
      counts: {
        totalRooms: 1,
        vacantClean: 0,
        vacantDirty: 0,
        inHouse: 0,
        dueOut: 1,
        stopSell: 0,
      },
      queues: {
        cleaning: 0,
        inspection: 0,
        pendingOperationRequests: 0,
        failedOperationRequests: 0,
      },
      projectionFreshness: {
        status: 'fresh',
        generatedAt: validMeta.requestedAt,
        note: 'pms-read-model-current',
      },
    };
    const projection: CommandProjection = {
      schemaVersion: pmsProjectionSchemaVersion,
      commandType: 'CHECK_OUT',
      mode: 'confirm',
      correlationId: validMeta.correlationId,
      idempotencyKey: validMeta.idempotencyKey,
      roomLedger: {
        schemaVersion: pmsProjectionSchemaVersion,
        roomId: 'room-1001',
        roomNumber: '1001',
        status: checkoutNextStatus,
        roomCode: '1001:vacant:dirty:sellable',
        lastActor: validMeta.actor,
        lastReason: validMeta.reason,
        lastUpdatedAt: validMeta.requestedAt,
      },
      operationLog: {
        auditId: 'audit-checkout-1',
        commandType: 'CHECK_OUT',
        roomId: 'room-1001',
        actor: validMeta.actor,
        source: validMeta.source,
        reason: validMeta.reason,
        idempotencyKey: validMeta.idempotencyKey,
        correlationId: validMeta.correlationId,
        occurredAt: validMeta.requestedAt,
        domainEventTypes: ['RoomCheckedOut'],
      },
    };

    expect(roomReadModel.room?.roomId).toBe('room-1001');
    expect(dashboardReadModel.counts.dueOut).toBe(1);
    expect(projection.roomLedger.status.occupancy).toBe('vacant');
    expect(projection.operationLog.commandType).toBe('CHECK_OUT');
  });

  it('keeps housekeeping and maintenance as explicit PMS-owned deferred command stubs', () => {
    expect(deferredPmsCommandStubs.map((stub) => stub.commandType)).toEqual(['HOUSEKEEPING_DONE', 'REPORT_MAINTENANCE']);
    expect(deferredPmsCommandStubs.every((stub) => stub.owner === 'pms-platform' && stub.mutationStatus === 'deferred')).toBe(true);
  });

  it('defines stable domain event payload shapes', () => {
    const roomCheckedIn: RoomCheckedInEvent = {
      eventId: 'evt-room-checked-in-1',
      type: 'RoomCheckedIn',
      aggregateId: 'room-1003',
      roomId: 'room-1003',
      previousStatus: checkinContractFixtures.room.status,
      nextStatus: checkInNextStatus,
      occurredAt: checkinContractFixtures.dryRunCommand.meta.requestedAt,
      correlationId: checkinContractFixtures.dryRunCommand.meta.correlationId,
      idempotencyKey: checkinContractFixtures.dryRunCommand.meta.idempotencyKey,
      actor: checkinContractFixtures.dryRunCommand.meta.actor,
    };

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

    const events: DomainEvent[] = [roomCheckedIn, roomCheckedOut, taskCreated];

    expect(events.map((event) => event.type)).toEqual(['RoomCheckedIn', 'RoomCheckedOut', 'HousekeepingTaskCreated']);
    expect(events.every((event) => event.correlationId.length > 0)).toBe(true);
  });
});

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
  type HousekeepingDoneCommand,
  type HousekeepingTaskCreatedEvent,
  type InventoryBlock,
  type InventoryDayRoom,
  type InventoryIntervalProjection,
  type InventoryReadModel,
  type InventorySummaryDayType,
  isOperationRequestStatus,
  isSupportedOperationRequestAction,
  type MaintenanceDoneCommand,
  type OperationRequest,
  type PmsCommandDryRunPlan,
  type ReportMaintenanceCommand,
  type RestoreSellableCommand,
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

  it('defines PMS-owned inventory calendar read-model contracts', () => {
    const block: InventoryBlock = {
      blockId: 'block-maintenance-ticket-1',
      propertyId: 'property-small-hotel',
      roomId: 'room-A2',
      roomTypeId: 'room-type-garden-villa',
      blockType: 'repair',
      startDate: '2026-04-28',
      status: 'active',
      sourceType: 'maintenance_ticket',
      sourceId: 'ticket-1',
      reason: 'Stop-sell repair.',
      createdAt: validMeta.requestedAt,
      updatedAt: validMeta.requestedAt,
    };
    const dayRoom: InventoryDayRoom = {
      businessDate: '2026-04-28',
      propertyId: 'property-small-hotel',
      roomId: 'room-A2',
      roomNumber: 'A2',
      roomTypeId: 'room-type-garden-villa',
      roomType: 'Garden Villa',
      availabilityStatus: 'blocked',
      sourceRefs: [{ sourceType: 'inventory_block', sourceId: block.blockId }],
      updatedAt: validMeta.requestedAt,
    };
    const interval: InventoryIntervalProjection = {
      projectionId: 'inventory-room-A2-2026-04-28-blocked',
      propertyId: 'property-small-hotel',
      roomId: 'room-A2',
      roomNumber: 'A2',
      roomTypeId: 'room-type-garden-villa',
      roomType: 'Garden Villa',
      startDate: '2026-04-28',
      endDate: '2026-04-29',
      calendarKind: 'blocked',
      sellableStatus: 'outOfOrder',
      title: 'A2 blocked',
      sourceRefs: dayRoom.sourceRefs,
      updatedAt: validMeta.requestedAt,
    };
    const summary: InventorySummaryDayType = {
      businessDate: '2026-04-28',
      propertyId: 'property-small-hotel',
      roomTypeId: 'room-type-garden-villa',
      roomType: 'Garden Villa',
      totalRooms: 1,
      availableRooms: 0,
      occupiedRooms: 0,
      blockedRooms: 1,
      reservedRooms: 0,
      updatedAt: validMeta.requestedAt,
    };
    const readModel: InventoryReadModel = {
      schemaVersion: pmsProjectionSchemaVersion,
      generatedAt: validMeta.requestedAt,
      startDate: '2026-04-28',
      endDate: '2026-04-29',
      horizonDays: 1,
      summaryStatus: 'fresh',
      blocks: [block],
      dayRooms: [dayRoom],
      intervals: [interval],
      summaries: [summary],
      projectionFreshness: {
        status: 'fresh',
        generatedAt: validMeta.requestedAt,
        note: 'pms-read-model-current',
      },
    };

    expect(readModel.intervals[0].calendarKind).toBe('blocked');
    expect(readModel.summaries[0].blockedRooms).toBe(1);
    expect(readModel.blocks[0].sourceType).toBe('maintenance_ticket');
  });

  it('defines PMS-owned operation request intake contracts', () => {
    const operationRequest: OperationRequest = {
      operationRequestId: 'opreq-form-checkout-room-1001',
      propertyId: 'property-small-hotel',
      clientToken: 'form-checkout-room-1001',
      requestFingerprint: 'sha256:form-checkout-room-1001',
      source: 'external_form',
      action: 'CHECK_OUT',
      status: 'queued',
      roomId: 'room-1001',
      roomNumber: '1001',
      reservationId: 'reservation-1001',
      payloadJson: '{"roomNumber":"1001"}',
      createdAt: validMeta.requestedAt,
      updatedAt: validMeta.requestedAt,
    };

    expect(operationRequest.action).toBe('CHECK_OUT');
    expect(operationRequest.status).toBe('queued');
    expect(isSupportedOperationRequestAction('RESTORE_SELLABLE')).toBe(true);
    expect(isSupportedOperationRequestAction('DELETE_ROOM')).toBe(false);
    expect(isOperationRequestStatus('awaitingConfirmation')).toBe(true);
    expect(isOperationRequestStatus('mutatedFromForm')).toBe(false);
  });

  it('defines housekeeping and maintenance as executable PMS-owned command contracts', () => {
    const housekeepingDone: HousekeepingDoneCommand = {
      type: 'HOUSEKEEPING_DONE',
      roomId: 'room-A1',
      inspectionRequired: true,
      meta: validMeta,
    };
    const reportMaintenance: ReportMaintenanceCommand = {
      type: 'REPORT_MAINTENANCE',
      roomId: 'room-A2',
      severity: 'StopSell',
      stopSellRequested: true,
      note: '空调故障',
      meta: validMeta,
    };
    const maintenanceDone: MaintenanceDoneCommand = {
      type: 'MAINTENANCE_DONE',
      roomId: 'room-A2',
      ticketId: 'ticket-1',
      meta: validMeta,
    };
    const restoreSellable: RestoreSellableCommand = {
      type: 'RESTORE_SELLABLE',
      roomId: 'room-A2',
      meta: validMeta,
    };
    const dryRunPlan: PmsCommandDryRunPlan = {
      commandType: 'HOUSEKEEPING_DONE',
      roomId: 'room-A1',
      roomNumber: 'A1',
      currentStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
      nextStatus: { occupancy: 'vacant', cleaning: 'inspection', sale: 'sellable' },
      housekeepingTask: {
        roomId: 'room-A1',
        kind: 'room-cleaning',
        status: 'inspection',
        reason: validMeta.reason,
        correlationId: validMeta.correlationId,
      },
      events: ['HousekeepingCompleted'],
      reason: validMeta.reason,
      correlationId: validMeta.correlationId,
      idempotencyKey: validMeta.idempotencyKey,
      requestedAt: validMeta.requestedAt,
      actor: validMeta.actor,
    };

    expect(deferredPmsCommandStubs).toEqual([]);
    expect([
      housekeepingDone.type,
      reportMaintenance.type,
      maintenanceDone.type,
      restoreSellable.type,
      dryRunPlan.commandType,
    ]).toEqual([
      'HOUSEKEEPING_DONE',
      'REPORT_MAINTENANCE',
      'MAINTENANCE_DONE',
      'RESTORE_SELLABLE',
      'HOUSEKEEPING_DONE',
    ]);
    expect(reportMaintenance.severity).toBe('StopSell');
    expect(dryRunPlan.nextStatus.cleaning).toBe('inspection');
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

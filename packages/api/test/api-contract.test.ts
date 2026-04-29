import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkinContractFixtures, checkoutContractFixtures } from '@pms-platform/contracts';
import {
  createInMemoryCorePorts,
  type CoreCheckInConfirmResult,
  type CoreCheckInDryRunPlan,
  type CoreCheckOutConfirmResult,
  type CoreCheckOutDryRunPlan,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  createInMemoryApiIdempotencyRepository,
  describeApiContractBoundary,
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executeDashboardApiRequest,
  executeGetRoomApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHousekeepingDoneOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsMaintenanceDoneOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestUpdateOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  requestFingerprintInput,
  toCheckInCommand,
  toCheckOutApiResponse,
  toCheckOutCommand,
  type ApiError,
  type CheckInApiResponse,
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutApiResponse,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type HousekeepingDoneApiRequest,
  type MaintenanceDoneApiRequest,
  type ReportMaintenanceApiRequest,
  type RestoreSellableApiRequest,
} from '../src/index.js';

const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const occupiedRoom: RoomAggregate = {
  roomId: 'room-1002',
  roomNumber: '1002',
  occupancyStatus: 'occupied',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const vacantCleanRoom: RoomAggregate = {
  roomId: 'room-1003',
  roomNumber: '1003',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};

const vacantDirtyRoom: RoomAggregate = {
  roomId: 'room-1004',
  roomNumber: '1004',
  occupancyStatus: 'vacant',
  cleaningStatus: 'dirty',
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

const checkInDryRunRequest: CheckInDryRunApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'dryRun',
  roomId: checkinContractFixtures.dryRunCommand.roomId,
  actor: checkinContractFixtures.actor,
  source: 'api',
  reason: checkinContractFixtures.dryRunCommand.meta.reason,
  idempotencyKey: checkinContractFixtures.dryRunCommand.meta.idempotencyKey,
  correlationId: checkinContractFixtures.dryRunCommand.meta.correlationId,
  requestedAt: checkinContractFixtures.dryRunCommand.meta.requestedAt,
  requestFingerprint: 'sha256:check-in-dry-run-fingerprint',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  ...checkInDryRunRequest,
  mode: 'confirm',
  requestFingerprint: 'sha256:check-in-confirm-fingerprint',
};

const housekeepingDoneRequest: HousekeepingDoneApiRequest = {
  operation: pmsHousekeepingDoneOperation,
  mode: 'confirm',
  roomId: 'room-1004',
  actor: checkoutContractFixtures.actor,
  source: 'api',
  reason: 'A room attendant marked the room clean and ready for inspection.',
  idempotencyKey: 'housekeeping-done-room-1004',
  correlationId: 'corr-housekeeping-room-1004',
  requestedAt: '2026-04-28T00:00:00.000Z',
  requestFingerprint: 'sha256:housekeeping-done-room-1004',
  inspectionRequired: true,
};

const reportMaintenanceRequest: ReportMaintenanceApiRequest = {
  operation: pmsReportMaintenanceOperation,
  mode: 'confirm',
  roomId: 'room-1003',
  actor: checkoutContractFixtures.actor,
  source: 'api',
  reason: 'Air conditioner is broken.',
  idempotencyKey: 'maintenance-report-room-1003',
  correlationId: 'corr-maintenance-room-1003',
  requestedAt: '2026-04-28T00:01:00.000Z',
  requestFingerprint: 'sha256:maintenance-report-room-1003',
  severity: 'StopSell',
  stopSellRequested: true,
  note: '空调故障，需要停售',
};

describe('API checkout contract skeleton', () => {
  it('imports PMS contracts/core types through package boundaries', () => {
    expect(describeApiContractBoundary()).toEqual({
      packageName: '@pms-platform/api',
      operation: 'pms_check_out',
      operations: [
        'pms_check_in',
        'pms_check_out',
        'pms_housekeeping_done',
        'pms_housekeeping_inspection',
        'pms_housekeeping_rework',
        'pms_report_maintenance',
        'pms_maintenance_done',
        'pms_restore_sellable',
        'pms_get_room',
        'pms_dashboard',
        'pms_reservation_get',
        'pms_today_arrivals',
        'pms_today_departures',
        'pms_room_reservation_context',
        'pms_inventory_intervals',
        'pms_inventory_summary',
        'pms_operation_request_create',
        'pms_operation_request_get',
        'pms_operation_request_update',
      ],
      importsCoreResult: true,
      exposesLocalHandler: true,
      supportedModes: ['dryRun', 'confirm'],
    });

    expect(toCheckOutCommand(dryRunRequest)).toEqual(checkoutContractFixtures.dryRunCommand);
    expect(toCheckInCommand(checkInDryRunRequest)).toEqual(checkinContractFixtures.dryRunCommand);
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
    expect(requestFingerprintInput(checkInDryRunRequest)).toMatchObject({
      operation: 'pms_check_in',
      mode: 'dryRun',
      roomId: 'room-1003',
      reason: 'Guest arrived with verified reservation.',
    });
  });

  it('defines inventory and operation-request operation names at the API boundary', () => {
    expect(pmsInventoryIntervalsOperation).toBe('pms_inventory_intervals');
    expect(pmsInventorySummaryOperation).toBe('pms_inventory_summary');
    expect(pmsOperationRequestCreateOperation).toBe('pms_operation_request_create');
    expect(pmsOperationRequestGetOperation).toBe('pms_operation_request_get');
    expect(pmsOperationRequestUpdateOperation).toBe('pms_operation_request_update');
  });

  it('defines pms_get_room and pms_dashboard read-model responses at the API boundary', () => {
    const ports = createInMemoryCorePorts([dueOutRoom, occupiedRoom, vacantCleanRoom]);
    const roomResponse = executeGetRoomApiRequest(
      {
        operation: pmsGetRoomOperation,
        roomId: 'room-1001',
        requestedAt: '2026-04-25T02:00:00.000Z',
      },
      ports,
    );
    const dashboardResponse = executeDashboardApiRequest(
      {
        operation: pmsDashboardOperation,
        requestedAt: '2026-04-25T02:00:00.000Z',
      },
      ports,
    );

    expect(roomResponse).toMatchObject({
      ok: true,
      operation: 'pms_get_room',
      readModel: {
        schemaVersion: 'pms-dashboard-mvp-v1',
        summaryStatus: 'fresh',
        room: {
          roomId: 'room-1001',
          status: {
            occupancy: 'dueOut',
          },
        },
      },
    });
    expect(dashboardResponse).toMatchObject({
      ok: true,
      operation: 'pms_dashboard',
      readModel: {
        counts: {
          totalRooms: 3,
          vacantClean: 1,
          inHouse: 1,
          dueOut: 1,
          stopSell: 0,
        },
      },
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

    const checkInPlan = {
      commandType: 'CHECK_IN',
      roomId: 'room-1003',
      roomNumber: '1003',
      currentStatus: checkinContractFixtures.room.status,
      nextStatus: {
        occupancy: 'occupied',
        cleaning: 'clean',
        sale: 'sellable',
      },
      overrideDirtyRoom: false,
      warnings: [],
      events: ['RoomCheckedIn'],
      reason: checkInDryRunRequest.reason,
      correlationId: checkInDryRunRequest.correlationId,
      idempotencyKey: checkInDryRunRequest.idempotencyKey,
      requestedAt: checkInDryRunRequest.requestedAt,
      actor: checkInDryRunRequest.actor,
    } satisfies CoreCheckInDryRunPlan;

    const checkInDryRunResponse: CheckInApiResponse = {
      ok: true,
      operation: 'pms_check_in',
      mode: 'dryRun',
      request: {
        idempotencyKey: checkInDryRunRequest.idempotencyKey,
        requestFingerprint: checkInDryRunRequest.requestFingerprint,
        fingerprintInput: requestFingerprintInput(checkInDryRunRequest),
      },
      plan: checkInPlan,
    };

    const checkInConfirmResult = {
      commandType: 'CHECK_IN',
      roomId: 'room-1003',
      roomNumber: '1003',
      previousStatus: checkinContractFixtures.room.status,
      nextStatus: checkInPlan.nextStatus,
      auditEntry: {
        auditId: 'audit-checkin-1',
        commandType: 'CHECK_IN',
        roomId: 'room-1003',
        actor: checkInDryRunRequest.actor,
        source: checkInDryRunRequest.source,
        reason: checkInDryRunRequest.reason,
        idempotencyKey: checkInDryRunRequest.idempotencyKey,
        correlationId: checkInDryRunRequest.correlationId,
        occurredAt: checkInDryRunRequest.requestedAt,
      },
      events: [],
    } satisfies CoreCheckInConfirmResult;

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
    expect(checkInDryRunResponse).toMatchObject({ ok: true, mode: 'dryRun', operation: 'pms_check_in' });
    expect(stableFailure.errors).toEqual<readonly ApiError[]>([checkoutContractFixtures.stableFailure]);
    expect(checkInConfirmResult.commandType).toBe('CHECK_IN');
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

  it('executes check-in dry-run and confirm through PMS Core at the API boundary', () => {
    const ports = createInMemoryCorePorts([vacantCleanRoom]);
    const dryRun = executeCheckInApiRequest(checkInDryRunRequest, ports);
    const confirm = executeCheckInApiRequest(checkInConfirmRequest, ports);

    expect(dryRun).toMatchObject({
      ok: true,
      operation: 'pms_check_in',
      mode: 'dryRun',
      plan: {
        commandType: 'CHECK_IN',
        roomId: 'room-1003',
        nextStatus: {
          occupancy: 'occupied',
          cleaning: 'clean',
          sale: 'sellable',
        },
      },
    });
    expect(confirm).toMatchObject({
      ok: true,
      operation: 'pms_check_in',
      mode: 'confirm',
      result: {
        commandType: 'CHECK_IN',
        roomId: 'room-1003',
        previousStatus: {
          occupancy: 'vacant',
          cleaning: 'clean',
          sale: 'sellable',
        },
        nextStatus: {
          occupancy: 'occupied',
          cleaning: 'clean',
          sale: 'sellable',
        },
      },
    });
    expect(ports.rooms.get('room-1003')?.occupancyStatus).toBe('occupied');
    expect(ports.housekeepingTasks.list()).toHaveLength(0);
    expect(ports.audits.list()).toHaveLength(1);
    expect(ports.events.list().map((event) => event.type)).toEqual(['RoomCheckedIn']);
  });

  it('executes housekeeping and maintenance commands through PMS Core at the API boundary', () => {
    const ports = createInMemoryCorePorts([vacantDirtyRoom, vacantCleanRoom]);
    const housekeeping = executePmsExtendedCommandApiRequest(housekeepingDoneRequest, ports);
    const maintenance = executePmsExtendedCommandApiRequest(reportMaintenanceRequest, ports);
    const ticketId = maintenance.ok && maintenance.mode === 'confirm' ? maintenance.result.maintenanceTicket?.ticketId : undefined;
    const maintenanceDoneRequest: MaintenanceDoneApiRequest = {
      operation: pmsMaintenanceDoneOperation,
      mode: 'confirm',
      roomId: 'room-1003',
      actor: checkoutContractFixtures.actor,
      source: 'api',
      reason: 'Maintenance technician marked the ticket complete.',
      idempotencyKey: 'maintenance-done-room-1003',
      correlationId: 'corr-maintenance-done-room-1003',
      requestedAt: '2026-04-28T00:02:00.000Z',
      requestFingerprint: 'sha256:maintenance-done-room-1003',
      ticketId,
    };
    const restoreSellableRequest: RestoreSellableApiRequest = {
      operation: pmsRestoreSellableOperation,
      mode: 'confirm',
      roomId: 'room-1003',
      actor: checkoutContractFixtures.actor,
      source: 'api',
      reason: 'Front desk approved restoring the room to sellable inventory.',
      idempotencyKey: 'restore-sellable-room-1003',
      correlationId: 'corr-restore-sellable-room-1003',
      requestedAt: '2026-04-28T00:03:00.000Z',
      requestFingerprint: 'sha256:restore-sellable-room-1003',
    };
    const maintenanceDone = executePmsExtendedCommandApiRequest(maintenanceDoneRequest, ports);
    const restored = executePmsExtendedCommandApiRequest(restoreSellableRequest, ports);

    expect(housekeeping).toMatchObject({
      ok: true,
      operation: 'pms_housekeeping_done',
      mode: 'confirm',
      result: {
        commandType: 'HOUSEKEEPING_DONE',
        nextStatus: { cleaning: 'inspection' },
        housekeepingTask: { status: 'inspection' },
      },
    });
    expect(maintenance).toMatchObject({
      ok: true,
      operation: 'pms_report_maintenance',
      mode: 'confirm',
      result: {
        commandType: 'REPORT_MAINTENANCE',
        nextStatus: { sale: 'outOfOrder' },
        maintenanceTicket: { status: 'open', stopSellRequested: true },
      },
    });
    expect(maintenanceDone).toMatchObject({
      ok: true,
      operation: 'pms_maintenance_done',
      mode: 'confirm',
      result: {
        commandType: 'MAINTENANCE_DONE',
        nextStatus: { sale: 'outOfOrder' },
        maintenanceTicket: { status: 'resolved' },
      },
    });
    expect(restored).toMatchObject({
      ok: true,
      operation: 'pms_restore_sellable',
      mode: 'confirm',
      result: {
        commandType: 'RESTORE_SELLABLE',
        nextStatus: { sale: 'sellable' },
      },
    });
    expect(ports.rooms.get('room-1004')?.cleaningStatus).toBe('inspection');
    expect(ports.rooms.get('room-1003')?.saleStatus).toBe('sellable');
    expect(ports.housekeepingTasks.list()).toHaveLength(1);
    expect(ports.maintenanceTickets.list()).toHaveLength(1);
    expect(ports.events.list().map((event) => event.type)).toEqual([
      'HousekeepingCompleted',
      'MaintenanceReported',
      'MaintenanceCompleted',
      'RoomSellabilityRestored',
    ]);
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

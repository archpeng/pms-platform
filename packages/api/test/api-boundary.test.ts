import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkinContractFixtures, checkoutContractFixtures, pmsProjectionSchemaVersion, type InventoryReadModel } from '@pms-platform/contracts';
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
  executeAvailabilitySearchApiRequest,
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executeDashboardApiRequest,
  executeGetRoomApiRequest,
  executePmsExtendedCommandApiRequest,
  executeReservationDraftWorkflowApiRequest,
  executeReservationGroupDraftWorkflowApiRequest,
  getPmsCapabilityManifest,
  getPmsCapabilityPlannerProjection,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsMaintenanceDoneOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsRestoreSellableOperation,
  requestFingerprintInput,
  toCheckInCommand,
  toCheckOutApiResponse,
  toCheckOutCommand,
  pmsAvailabilitySearchOperation,
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
  type ReservationDraftCreateApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationGroupPrepareConfirmApiRequest,
  type ReservationPrepareConfirmApiRequest,
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

describe('API checkout contract skeleton - api-boundary', () => {
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
          'pms_availability_search',
          'pms.reservation.draft.create',
          'pms.reservation.draft.update',
          'pms.reservation.quote',
          'pms.reservation.prepare_confirm',
          'pms.reservation.draft.cancel',
          'pms.reservation.group_draft.create',
          'pms.reservation.group_draft.update',
          'pms.reservation.group_quote',
          'pms.reservation.group_prepare_confirm',
          'pms.reservation.group_draft.cancel',
          'pms.pending_action.status',
          'pms.pending_action.confirm',
          'pms.pending_action.cancel',
          'pms_operation_request_create',
          'pms_operation_request_get',
          'pms_operation_request_list',
          'pms_operation_request_update',
          'pms_capabilities_manifest',
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
      expect(requestFingerprintInput({
        ...checkInConfirmRequest,
        reservationId: 'res-1003-1',
        reservationCode: 'R-1003-1',
      })).toMatchObject({
        operation: 'pms_check_in',
        mode: 'confirm',
        roomId: 'room-1003',
        parameters: {
          reservationId: 'res-1003-1',
          reservationCode: 'R-1003-1',
        },
      });
    });
  
    
  
  it('defines inventory and operation-request operation names at the API boundary', () => {
      expect(pmsInventoryIntervalsOperation).toBe('pms_inventory_intervals');
      expect(pmsInventorySummaryOperation).toBe('pms_inventory_summary');
      expect(pmsAvailabilitySearchOperation).toBe('pms_availability_search');
      expect(pmsReservationDraftCreateOperation).toBe('pms.reservation.draft.create');
      expect(pmsReservationDraftUpdateOperation).toBe('pms.reservation.draft.update');
      expect(pmsReservationQuoteOperation).toBe('pms.reservation.quote');
      expect(pmsReservationPrepareConfirmOperation).toBe('pms.reservation.prepare_confirm');
      expect(pmsReservationDraftCancelOperation).toBe('pms.reservation.draft.cancel');
      expect(pmsReservationGroupDraftCreateOperation).toBe('pms.reservation.group_draft.create');
      expect(pmsReservationGroupDraftUpdateOperation).toBe('pms.reservation.group_draft.update');
      expect(pmsReservationGroupQuoteOperation).toBe('pms.reservation.group_quote');
      expect(pmsReservationGroupPrepareConfirmOperation).toBe('pms.reservation.group_prepare_confirm');
      expect(pmsReservationGroupDraftCancelOperation).toBe('pms.reservation.group_draft.cancel');
      expect(pmsOperationRequestCreateOperation).toBe('pms_operation_request_create');
      expect(pmsOperationRequestGetOperation).toBe('pms_operation_request_get');
      expect(pmsOperationRequestListOperation).toBe('pms_operation_request_list');
      expect(pmsOperationRequestUpdateOperation).toBe('pms_operation_request_update');
      expect(pmsPendingActionStatusOperation).toBe('pms.pending_action.status');
      expect(pmsPendingActionConfirmOperation).toBe('pms.pending_action.confirm');
      expect(pmsPendingActionCancelOperation).toBe('pms.pending_action.cancel');
      expect(pmsCapabilityManifestOperation).toBe('pms_capabilities_manifest');
    });
  
    
  
  it('exposes a typed capability manifest with a sanitized planner projection', () => {
      const manifest = getPmsCapabilityManifest('2026-05-02T00:00:00.000Z');
      const projection = getPmsCapabilityPlannerProjection(manifest.capabilities);
      const byName = new Map(manifest.capabilities.map((capability) => [capability.name, capability]));
  
      expect(manifest).toMatchObject({
        schemaVersion: 'pms-capability-manifest-v1',
        generatedAt: '2026-05-02T00:00:00.000Z',
      });
      expect(byName.get('pms_get_room')).toMatchObject({
        class: 'read',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        endpoint: { method: 'POST', path: '/v1/pms/room', auth: 'bearer-token' },
      });
      expect(byName.get('pms_check_out.dryRun')).toMatchObject({
        class: 'dryRun',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        idempotency: { required: true, fingerprintRequired: true },
      });
      expect(byName.get('pms_check_out.confirm')).toMatchObject({
        class: 'confirm',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        confirmationRequired: true,
        audit: { auditRequired: true, emitsDomainEvents: true },
      });
      expect(byName.get('pms_operation_request_create')).toMatchObject({
        class: 'safeIntake',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        schemaRefs: { request: 'OperationRequestCreateApiRequest', response: 'OperationRequestCreateApiResponse' },
        endpoint: { method: 'POST', path: '/v1/pms/operation-requests/create', auth: 'bearer-token' },
        refs: { readModel: 'OperationRequest' },
        audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
      });
      expect(byName.get('pms_operation_request_update')).toMatchObject({
        class: 'safeIntake',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        confirmationRequired: false,
        schemaRefs: { request: 'OperationRequestUpdateApiRequest', response: 'OperationRequestUpdateApiResponse' },
        endpoint: { method: 'POST', path: '/v1/pms/operation-requests/update', auth: 'bearer-token' },
        refs: { readModel: 'OperationRequest' },
        audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
      });
      expect(byName.get('pms_availability_search')).toMatchObject({
        class: 'read',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        endpoint: { method: 'POST', path: '/v1/pms/availability/search', auth: 'bearer-token' },
        refs: { readModel: 'AvailabilitySearchReadModel' },
      });
      expect(byName.get('pms.reservation.draft.create')).toMatchObject({
        class: 'draft',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        schemaRefs: { request: 'ReservationDraftCreateApiRequest', response: 'ReservationDraftWorkflowApiResponse' },
        refs: { workflow: 'reservationDraft' },
        idempotency: { required: true, keyField: 'clientToken', fingerprintRequired: true },
        audit: { auditRequired: true, emitsDomainEvents: false },
        endpoint: { method: 'POST', path: '/v1/pms/reservation-drafts/create', auth: 'bearer-token' },
      });
      expect(byName.get('pms.reservation.draft.update')?.slots).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'draftRef', required: true, source: 'context' }),
      ]));
      expect(byName.get('pms.reservation.prepare_confirm')).toMatchObject({
        class: 'prepareConfirm',
        customerChatAllowed: true,
        naturalLanguageExecutable: true,
        confirmationRequired: false,
        schemaRefs: { request: 'ReservationPrepareConfirmApiRequest', response: 'ReservationDraftWorkflowApiResponse' },
        endpoint: { method: 'POST', path: '/v1/pms/reservation-drafts/prepare-confirm', auth: 'bearer-token' },
        slots: expect.arrayContaining([expect.objectContaining({ name: 'draftRef', required: true, source: 'context' })]),
      });
      expect(byName.get('pms.pending_action.status')).toMatchObject({
        class: 'internal',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        schemaRefs: { request: 'PendingActionStatusApiRequest', response: 'PendingActionCallbackApiResponse' },
        endpoint: { method: 'POST', path: '/v1/pms/pending-actions/status' },
      });
      expect(byName.get('pms.pending_action.confirm')).toMatchObject({
        class: 'internal',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        endpoint: { method: 'POST', path: '/v1/pms/pending-actions/confirm' },
      });
      expect(byName.get('pms.pending_action.cancel')).toMatchObject({
        class: 'internal',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        endpoint: { method: 'POST', path: '/v1/pms/pending-actions/cancel' },
      });
      expect(byName.get('pms_capabilities_manifest')).toMatchObject({
        class: 'internal',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
        endpoint: { method: 'GET', path: '/v1/pms/capabilities/manifest' },
      });
      expect(byName.get('pms_sandbox_reset')).toMatchObject({
        class: 'internal',
        customerChatAllowed: false,
        naturalLanguageExecutable: false,
      });
  
      expect(projection.capabilities.some((capability) => capability.class === 'confirm')).toBe(false);
      expect(projection.capabilities.some((capability) => capability.class === 'internal')).toBe(false);
      expect(projection.capabilities.some((capability) => capability.name === 'pms_operation_request_update')).toBe(false);
      expect(projection.capabilities.map((capability) => capability.name)).toEqual(expect.arrayContaining([
        'pms_get_room',
        'pms_check_out.dryRun',
        'pms_operation_request_create',
        'pms.reservation.draft.create',
        'pms.reservation.quote',
        'pms.reservation.prepare_confirm',
      ]));
      expect(JSON.stringify(projection)).not.toContain('/v1/pms/');
      expect(JSON.stringify(projection)).not.toContain('bearer-token');
  
      const projectedByName = new Map(projection.capabilities.map((capability) => [capability.name, capability]));
      const expectedAgentSafeCapabilities = [
        { name: 'pms_availability_search', class: 'read', refs: { readModel: 'AvailabilitySearchReadModel' } },
        { name: 'pms.reservation.draft.create', class: 'draft', refs: { workflow: 'reservationDraft' } },
        { name: 'pms.reservation.draft.update', class: 'draft', refs: { workflow: 'reservationDraft' } },
        { name: 'pms.reservation.quote', class: 'draft', refs: { workflow: 'reservationDraft' } },
        { name: 'pms.reservation.prepare_confirm', class: 'prepareConfirm', refs: { workflow: 'reservationDraft' } },
      ] as const;
      for (const capability of expectedAgentSafeCapabilities) {
        expect(projectedByName.get(capability.name)).toMatchObject({
          class: capability.class,
          customerChatAllowed: true,
          naturalLanguageExecutable: true,
          confirmationRequired: false,
          refs: capability.refs,
        });
      }
      for (const capability of projection.capabilities) expect('endpoint' in capability).toBe(false);
      const excludedPlannerNames = new Set(projection.capabilities.map((capability) => capability.name));
      for (const capability of manifest.capabilities.filter((item) => item.class === 'confirm' || item.class === 'internal')) {
        expect(excludedPlannerNames.has(capability.name)).toBe(false);
      }
      expect(excludedPlannerNames.has('pms.pending_action.status')).toBe(false);
      expect(excludedPlannerNames.has('pms.pending_action.confirm')).toBe(false);
      expect(excludedPlannerNames.has('pms.pending_action.cancel')).toBe(false);
  
      const fixedEndpointMatrix = [
        { name: 'pms_dashboard', request: 'DashboardApiRequest', response: 'DashboardApiResponse', path: '/v1/pms/dashboard', operation: 'pms_dashboard', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_get_room', request: 'GetRoomApiRequest', response: 'GetRoomApiResponse', path: '/v1/pms/room', operation: 'pms_get_room', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_reservation_get', request: 'ReservationGetApiRequest', response: 'ReservationGetApiResponse', path: '/v1/pms/reservations/get', operation: 'pms_reservation_get', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_today_arrivals', request: 'TodayReservationsApiRequest', response: 'TodayReservationsApiResponse', path: '/v1/pms/reservations/today-arrivals', operation: 'pms_today_arrivals', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_today_departures', request: 'TodayReservationsApiRequest', response: 'TodayReservationsApiResponse', path: '/v1/pms/reservations/today-departures', operation: 'pms_today_departures', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_availability_search', request: 'AvailabilitySearchApiRequest', response: 'AvailabilitySearchApiResponse', path: '/v1/pms/availability/search', operation: 'pms_availability_search', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_operation_request_create', request: 'OperationRequestCreateApiRequest', response: 'OperationRequestCreateApiResponse', path: '/v1/pms/operation-requests/create', operation: 'pms_operation_request_create', class: 'safeIntake', naturalLanguageExecutable: true },
        { name: 'pms_operation_request_get', request: 'OperationRequestGetApiRequest', response: 'OperationRequestGetApiResponse', path: '/v1/pms/operation-requests/get', operation: 'pms_operation_request_get', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_operation_request_list', request: 'OperationRequestListApiRequest', response: 'OperationRequestListApiResponse', path: '/v1/pms/operation-requests/list', operation: 'pms_operation_request_list', class: 'read', naturalLanguageExecutable: true },
        { name: 'pms_operation_request_update', request: 'OperationRequestUpdateApiRequest', response: 'OperationRequestUpdateApiResponse', path: '/v1/pms/operation-requests/update', operation: 'pms_operation_request_update', class: 'safeIntake', naturalLanguageExecutable: false },
        { name: 'pms_check_in.dryRun', request: 'CheckInDryRunApiRequest', response: 'CheckInApiResponse', path: '/v1/pms/check-in', operation: pmsCheckInOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_check_out.dryRun', request: 'CheckOutDryRunApiRequest', response: 'CheckOutApiResponse', path: '/v1/pms/check-out', operation: pmsCheckOutOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_housekeeping_done.dryRun', request: 'HousekeepingDoneDryRunApiRequest', response: 'HousekeepingDoneApiResponse', path: '/v1/pms/housekeeping/done', operation: pmsHousekeepingDoneOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_housekeeping_inspection.dryRun', request: 'HousekeepingInspectionDryRunApiRequest', response: 'HousekeepingInspectionApiResponse', path: '/v1/pms/housekeeping/inspection', operation: pmsHousekeepingInspectionOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_housekeeping_rework.dryRun', request: 'HousekeepingReworkDryRunApiRequest', response: 'HousekeepingReworkApiResponse', path: '/v1/pms/housekeeping/rework', operation: pmsHousekeepingReworkOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_report_maintenance.dryRun', request: 'ReportMaintenanceDryRunApiRequest', response: 'ReportMaintenanceApiResponse', path: '/v1/pms/maintenance/report', operation: pmsReportMaintenanceOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_maintenance_done.dryRun', request: 'MaintenanceDoneDryRunApiRequest', response: 'MaintenanceDoneApiResponse', path: '/v1/pms/maintenance/done', operation: pmsMaintenanceDoneOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms_restore_sellable.dryRun', request: 'RestoreSellableDryRunApiRequest', response: 'RestoreSellableApiResponse', path: '/v1/pms/maintenance/restore-sellable', operation: pmsRestoreSellableOperation, class: 'dryRun', naturalLanguageExecutable: true, mode: 'dryRun' },
        { name: 'pms.reservation.draft.create', request: 'ReservationDraftCreateApiRequest', response: 'ReservationDraftWorkflowApiResponse', path: '/v1/pms/reservation-drafts/create', operation: pmsReservationDraftCreateOperation, class: 'draft', naturalLanguageExecutable: true },
        { name: 'pms.reservation.draft.update', request: 'ReservationDraftUpdateApiRequest', response: 'ReservationDraftWorkflowApiResponse', path: '/v1/pms/reservation-drafts/update', operation: pmsReservationDraftUpdateOperation, class: 'draft', naturalLanguageExecutable: true },
        { name: 'pms.reservation.quote', request: 'ReservationQuoteApiRequest', response: 'ReservationDraftWorkflowApiResponse', path: '/v1/pms/reservation-drafts/quote', operation: pmsReservationQuoteOperation, class: 'draft', naturalLanguageExecutable: true },
        { name: 'pms.reservation.prepare_confirm', request: 'ReservationPrepareConfirmApiRequest', response: 'ReservationDraftWorkflowApiResponse', path: '/v1/pms/reservation-drafts/prepare-confirm', operation: pmsReservationPrepareConfirmOperation, class: 'prepareConfirm', naturalLanguageExecutable: true },
        { name: 'pms.reservation.draft.cancel', request: 'ReservationDraftCancelApiRequest', response: 'ReservationDraftWorkflowApiResponse', path: '/v1/pms/reservation-drafts/cancel', operation: pmsReservationDraftCancelOperation, class: 'draft', naturalLanguageExecutable: true },
        { name: 'pms.pending_action.status', request: 'PendingActionStatusApiRequest', response: 'PendingActionCallbackApiResponse', path: '/v1/pms/pending-actions/status', operation: pmsPendingActionStatusOperation, class: 'internal', naturalLanguageExecutable: false },
        { name: 'pms.pending_action.confirm', request: 'PendingActionConfirmApiRequest', response: 'PendingActionCallbackApiResponse', path: '/v1/pms/pending-actions/confirm', operation: pmsPendingActionConfirmOperation, class: 'internal', naturalLanguageExecutable: false },
        { name: 'pms.pending_action.cancel', request: 'PendingActionCancelApiRequest', response: 'PendingActionCallbackApiResponse', path: '/v1/pms/pending-actions/cancel', operation: pmsPendingActionCancelOperation, class: 'internal', naturalLanguageExecutable: false },
      ] as const;
      for (const item of fixedEndpointMatrix) {
        const capability = byName.get(item.name);
        expect(capability).toMatchObject({
          class: item.class,
          naturalLanguageExecutable: item.naturalLanguageExecutable,
          schemaRefs: { request: item.request, response: item.response },
          endpoint: { method: 'POST', path: item.path, operation: item.operation, auth: 'bearer-token' },
        });
        if ('mode' in item) expect(capability).toMatchObject({ endpoint: { mode: item.mode }, audit: { emitsDomainEvents: false, eventTypes: [] } });
        expect(item.path).not.toMatch(/[:{}*]/);
      }
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

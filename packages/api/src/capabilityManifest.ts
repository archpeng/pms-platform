import type {
  PmsCapabilityClass,
  PmsCapabilityManifest,
  PmsCapabilityManifestItem,
  PmsCapabilityPlannerProjection,
  PmsCapabilityPlannerProjectionItem,
} from '@pms-platform/contracts';
import {
  pmsAvailabilitySearchOperation,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsHotelProfileOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingMarkDirtyOperation,
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
  pmsReservationAdjustOperation,
  pmsReservationCancelPrepareOperation,
  pmsReservationCreateOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupPrepareBookingOperation,
  pmsReservationGetOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareBookingOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsReservationSearchOperation,
  pmsRestoreSellableOperation,
  pmsRoomTypeCatalogOperation,
  pmsRoomReservationContextOperation,
  pmsTodayArrivalsOperation,
  pmsTodayDeparturesOperation,
  type PmsApiMode,
  type PmsCommandOperation,
  type PmsOperationRequestOperation,
  type PmsReservationAdjustWorkflowOperation,
  type PmsReservationCancelWorkflowOperation,
  type PmsReservationCreateWorkflowOperation,
  type PmsReservationDraftWorkflowOperation,
  type PmsReservationGroupDraftWorkflowOperation,
} from './operations.js';

export function getPmsCapabilityManifest(generatedAt = new Date().toISOString()): PmsCapabilityManifest {
  const capabilities = buildPmsCapabilityManifestItems();
  return {
    schemaVersion: 'pms-capability-manifest-v1',
    generatedAt,
    capabilities,
    plannerProjection: getPmsCapabilityPlannerProjection(capabilities),
  };
}

export function getPmsCapabilityPlannerProjection(
  capabilities: readonly PmsCapabilityManifestItem[],
): PmsCapabilityPlannerProjection {
  return {
    schemaVersion: 'pms-capability-planner-projection-v1',
    capabilities: capabilities
      .filter((capability) =>
        capability.customerChatAllowed &&
        capability.naturalLanguageExecutable &&
        !capability.confirmationRequired &&
        capability.class !== 'confirm' &&
        capability.class !== 'internal'
      )
      .map(({ endpoint: _endpoint, ...capability }): PmsCapabilityPlannerProjectionItem => capability),
  };
}

function buildPmsCapabilityManifestItems(): readonly PmsCapabilityManifestItem[] {
  return [
    readCapability(pmsGetRoomOperation, '/v1/pms/room', 'GetRoomApiRequest', 'GetRoomApiResponse', [{ name: 'roomId', required: true, source: 'user' }], 'RoomReadModel'),
    readCapability(pmsDashboardOperation, '/v1/pms/dashboard', 'DashboardApiRequest', 'DashboardApiResponse', [], 'DashboardReadModel'),
    readCapability(pmsHotelProfileOperation, '/v1/pms/hotel/profile', 'HotelProfileApiRequest', 'HotelProfileApiResponse', [{ name: 'propertyId', required: false, source: 'context' }], 'HotelProfileReadModel'),
    readCapability(pmsRoomTypeCatalogOperation, '/v1/pms/room-types/catalog', 'RoomTypeCatalogApiRequest', 'RoomTypeCatalogApiResponse', [{ name: 'propertyId', required: false, source: 'context' }], 'RoomTypeCatalogReadModel'),
    readCapability(pmsReservationGetOperation, '/v1/pms/reservations/get', 'ReservationGetApiRequest', 'ReservationGetApiResponse', [{ name: 'reservationCode', required: true, source: 'user' }], 'ReservationReadModel'),
    readCapability(pmsReservationSearchOperation, '/v1/pms/reservations/search', 'ReservationSearchApiRequest', 'ReservationSearchApiResponse', [
      { name: 'guestDisplayName', required: true, source: 'user' },
      { name: 'status', required: false, source: 'user' },
      { name: 'arrivalDateFrom', required: false, source: 'user' },
      { name: 'arrivalDateTo', required: false, source: 'user' },
      { name: 'limit', required: false, source: 'user' },
    ], 'ReservationSearchReadModel'),
    readCapability(pmsTodayArrivalsOperation, '/v1/pms/reservations/today-arrivals', 'TodayReservationsApiRequest', 'TodayReservationsApiResponse', [{ name: 'businessDate', required: true, source: 'user' }], 'TodayReservationsReadModel'),
    readCapability(pmsTodayDeparturesOperation, '/v1/pms/reservations/today-departures', 'TodayReservationsApiRequest', 'TodayReservationsApiResponse', [{ name: 'businessDate', required: true, source: 'user' }], 'TodayReservationsReadModel'),
    readCapability(pmsRoomReservationContextOperation, '/v1/pms/room/reservation-context', 'RoomReservationContextApiRequest', 'RoomReservationContextApiResponse', [{ name: 'roomId', required: true, source: 'user' }], 'RoomReservationContextReadModel'),
    readCapability(pmsInventoryIntervalsOperation, '/v1/pms/inventory/intervals', 'InventoryIntervalsApiRequest', 'InventoryIntervalsApiResponse', [], 'InventoryReadModel'),
    readCapability(pmsInventorySummaryOperation, '/v1/pms/inventory/summary', 'InventorySummaryApiRequest', 'InventorySummaryApiResponse', [], 'InventoryReadModel'),
    readCapability(pmsAvailabilitySearchOperation, '/v1/pms/availability/search', 'AvailabilitySearchApiRequest', 'AvailabilitySearchApiResponse', [
      { name: 'startDate', required: true, source: 'user' },
      { name: 'endDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
      { name: 'capacity', required: false, source: 'user' },
      { name: 'count', required: false, source: 'user' },
    ], 'AvailabilitySearchReadModel'),
    reservationDraftCapability(pmsReservationDraftCreateOperation, '/v1/pms/reservation-drafts/create', 'draft', 'ReservationDraftCreateApiRequest', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'guestDisplayName', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationDraftUpdateOperation, '/v1/pms/reservation-drafts/update', 'draft', 'ReservationDraftUpdateApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'guestDisplayName', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationQuoteOperation, '/v1/pms/reservation-drafts/quote', 'draft', 'ReservationQuoteApiRequest', [
      { name: 'draftRef', required: false, source: 'context' },
      { name: 'selectedCandidateRef', required: false, source: 'user' },
    ]),
    reservationDraftCapability(pmsReservationPrepareConfirmOperation, '/v1/pms/reservation-drafts/prepare-confirm', 'prepareConfirm', 'ReservationPrepareConfirmApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'quoteRef', required: false, source: 'context' },
    ]),
    reservationDraftCapability(pmsReservationDraftCancelOperation, '/v1/pms/reservation-drafts/cancel', 'draft', 'ReservationDraftCancelApiRequest', [
      { name: 'draftRef', required: true, source: 'context' },
      { name: 'reason', required: true, source: 'user' },
    ]),
    reservationGroupDraftCapability(pmsReservationGroupDraftCreateOperation, '/v1/pms/reservation-group-drafts/create', 'draft', 'ReservationGroupDraftCreateApiRequest', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'guestDisplayName', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'quantity', required: true, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
    ]),
    reservationGroupDraftCapability(pmsReservationGroupDraftUpdateOperation, '/v1/pms/reservation-group-drafts/update', 'draft', 'ReservationGroupDraftUpdateApiRequest', [
      { name: 'groupDraftRef', required: true, source: 'context' },
      { name: 'selections', required: true, source: 'context', schemaRef: 'ReservationGroupRoomSelection[]' },
    ]),
    reservationGroupDraftCapability(pmsReservationGroupQuoteOperation, '/v1/pms/reservation-group-drafts/quote', 'draft', 'ReservationGroupQuoteApiRequest', [
      { name: 'groupDraftRef', required: true, source: 'context' },
    ]),
    reservationGroupDraftCapability(pmsReservationGroupPrepareConfirmOperation, '/v1/pms/reservation-group-drafts/prepare-confirm', 'prepareConfirm', 'ReservationGroupPrepareConfirmApiRequest', [
      { name: 'groupDraftRef', required: true, source: 'context' },
      { name: 'quoteRef', required: false, source: 'context' },
    ]),
    reservationGroupDraftCapability(pmsReservationGroupDraftCancelOperation, '/v1/pms/reservation-group-drafts/cancel', 'draft', 'ReservationGroupDraftCancelApiRequest', [
      { name: 'groupDraftRef', required: true, source: 'context' },
      { name: 'reason', required: true, source: 'user' },
    ]),
    workflowCapability(pmsReservationCancelPrepareOperation, '/v1/pms/reservations/cancel/prepare', 'prepareConfirm', 'ReservationCancelPrepareApiRequest', 'ReservationCancelPrepareApiResponse', 'reservationCancel', [
      { name: 'reservationCode', required: false, source: 'user' },
      { name: 'reservationId', required: false, source: 'context' },
      { name: 'reason', required: true, source: 'user' },
    ]),
    workflowCapability(pmsReservationCreateOperation, '/v1/pms/reservations/create', 'prepareConfirm', 'ReservationCreateApiRequest', 'ReservationCreateApiResponse', 'reservationCreate', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'roomId', required: true, source: 'user' },
      { name: 'guestDisplayName', required: true, source: 'user' },
      { name: 'arrivalDate', required: true, source: 'user' },
      { name: 'departureDate', required: true, source: 'user' },
      { name: 'reason', required: false, source: 'user' },
    ]),
    workflowCapability(pmsReservationPrepareBookingOperation, '/v1/pms/reservations/prepare-booking', 'prepareConfirm', 'ReservationPrepareBookingApiRequest', 'ReservationCreateApiResponse', 'reservationPrepareBooking', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'guestDisplayName', required: true, source: 'user' },
      { name: 'arrivalDate', required: true, source: 'user' },
      { name: 'departureDate', required: true, source: 'user' },
      { name: 'roomId', required: false, source: 'user' },
      { name: 'roomNumber', required: false, source: 'user' },
      { name: 'roomTypeKeyword', required: false, source: 'user' },
      { name: 'reason', required: false, source: 'user' },
    ]),
    workflowCapability(pmsReservationGroupPrepareBookingOperation, '/v1/pms/reservation-groups/prepare-booking', 'prepareConfirm', 'ReservationGroupPrepareBookingApiRequest', 'ReservationCreateApiResponse', 'reservationGroupPrepareBooking', [
      { name: 'propertyId', required: true, source: 'context' },
      { name: 'guestDisplayName', required: true, source: 'user' },
      { name: 'arrivalDate', required: true, source: 'user' },
      { name: 'departureDate', required: true, source: 'user' },
      { name: 'quantity', required: true, source: 'user' },
      { name: 'roomTypeKeyword', required: true, source: 'user' },
      { name: 'reason', required: false, source: 'user' },
    ]),
    workflowCapability(pmsReservationAdjustOperation, '/v1/pms/reservations/adjust', 'prepareConfirm', 'ReservationAdjustApiRequest', 'ReservationAdjustApiResponse', 'reservationAdjust', [
      { name: 'reservationCode', required: false, source: 'user' },
      { name: 'reservationId', required: false, source: 'context' },
      { name: 'targetRoomId', required: false, source: 'user' },
      { name: 'arrivalDate', required: false, source: 'user' },
      { name: 'departureDate', required: false, source: 'user' },
      { name: 'guestDisplayName', required: false, source: 'user' },
    ]),
    readCapability(pmsOperationRequestGetOperation, '/v1/pms/operation-requests/get', 'OperationRequestGetApiRequest', 'OperationRequestGetApiResponse', [{ name: 'operationRequestId', required: false, source: 'context' }], 'OperationRequest'),
    readCapability(pmsOperationRequestListOperation, '/v1/pms/operation-requests/list', 'OperationRequestListApiRequest', 'OperationRequestListApiResponse', [], 'OperationRequest'),
    commandCapability(pmsCheckInOperation, 'CHECK_IN', '/v1/pms/check-in', 'dryRun', ['RoomCheckedIn'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'reservationCode', required: false, source: 'user' }]),
    commandCapability(pmsCheckInOperation, 'CHECK_IN', '/v1/pms/check-in', 'confirm', ['RoomCheckedIn'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'reservationCode', required: false, source: 'user' }]),
    commandCapability(pmsCheckOutOperation, 'CHECK_OUT', '/v1/pms/check-out', 'dryRun', ['RoomCheckedOut', 'HousekeepingTaskCreated'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsCheckOutOperation, 'CHECK_OUT', '/v1/pms/check-out', 'confirm', ['RoomCheckedOut', 'HousekeepingTaskCreated'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingDoneOperation, 'HOUSEKEEPING_DONE', '/v1/pms/housekeeping/done', 'dryRun', ['HousekeepingCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingDoneOperation, 'HOUSEKEEPING_DONE', '/v1/pms/housekeeping/done', 'confirm', ['HousekeepingCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingInspectionOperation, 'HOUSEKEEPING_INSPECTION', '/v1/pms/housekeeping/inspection', 'dryRun', ['HousekeepingInspectionPassed', 'HousekeepingInspectionFailed'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'result', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingInspectionOperation, 'HOUSEKEEPING_INSPECTION', '/v1/pms/housekeeping/inspection', 'confirm', ['HousekeepingInspectionPassed', 'HousekeepingInspectionFailed'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'result', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingReworkOperation, 'HOUSEKEEPING_REWORK', '/v1/pms/housekeeping/rework', 'dryRun', ['HousekeepingReworkCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingReworkOperation, 'HOUSEKEEPING_REWORK', '/v1/pms/housekeeping/rework', 'confirm', ['HousekeepingReworkCompleted'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingMarkDirtyOperation, 'HOUSEKEEPING_MARK_DIRTY', '/v1/pms/housekeeping/mark-dirty', 'dryRun', ['HousekeepingMarkedDirty'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsHousekeepingMarkDirtyOperation, 'HOUSEKEEPING_MARK_DIRTY', '/v1/pms/housekeeping/mark-dirty', 'confirm', ['HousekeepingMarkedDirty'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsReportMaintenanceOperation, 'REPORT_MAINTENANCE', '/v1/pms/maintenance/report', 'dryRun', ['MaintenanceReported'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'severity', required: false, source: 'user' }]),
    commandCapability(pmsReportMaintenanceOperation, 'REPORT_MAINTENANCE', '/v1/pms/maintenance/report', 'confirm', ['MaintenanceReported'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'severity', required: false, source: 'user' }]),
    commandCapability(pmsMaintenanceDoneOperation, 'MAINTENANCE_DONE', '/v1/pms/maintenance/done', 'dryRun', ['MaintenanceCompleted'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'ticketId', required: false, source: 'context' }]),
    commandCapability(pmsMaintenanceDoneOperation, 'MAINTENANCE_DONE', '/v1/pms/maintenance/done', 'confirm', ['MaintenanceCompleted'], [{ name: 'roomId', required: true, source: 'user' }, { name: 'ticketId', required: false, source: 'context' }]),
    commandCapability(pmsRestoreSellableOperation, 'RESTORE_SELLABLE', '/v1/pms/maintenance/restore-sellable', 'dryRun', ['RoomSellabilityRestored'], [{ name: 'roomId', required: true, source: 'user' }]),
    commandCapability(pmsRestoreSellableOperation, 'RESTORE_SELLABLE', '/v1/pms/maintenance/restore-sellable', 'confirm', ['RoomSellabilityRestored'], [{ name: 'roomId', required: true, source: 'user' }]),
    operationRequestSafeIntakeCapability({
      operation: pmsOperationRequestCreateOperation,
      path: '/v1/pms/operation-requests/create',
      requestSchemaRef: 'OperationRequestCreateApiRequest',
      responseSchemaRef: 'OperationRequestCreateApiResponse',
      customerChatAllowed: true,
      naturalLanguageExecutable: true,
      slots: [{ name: 'action', required: true, source: 'user' }],
      idempotency: { required: true, keyField: 'clientToken', fingerprintRequired: true, replaySafe: true },
    }),
    operationRequestSafeIntakeCapability({
      operation: pmsOperationRequestUpdateOperation,
      path: '/v1/pms/operation-requests/update',
      requestSchemaRef: 'OperationRequestUpdateApiRequest',
      responseSchemaRef: 'OperationRequestUpdateApiResponse',
      customerChatAllowed: false,
      naturalLanguageExecutable: false,
      slots: [
        { name: 'operationRequestId', required: false, source: 'context' },
        { name: 'clientToken', required: false, source: 'context' },
        { name: 'status', required: false, source: 'system' },
      ],
      idempotency: { required: false, fingerprintRequired: false, replaySafe: false },
    }),
    internalCapability(pmsPendingActionStatusOperation, 'POST', '/v1/pms/pending-actions/status', 'PendingActionStatusApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsPendingActionConfirmOperation, 'POST', '/v1/pms/pending-actions/confirm', 'PendingActionConfirmApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsPendingActionCancelOperation, 'POST', '/v1/pms/pending-actions/cancel', 'PendingActionCancelApiRequest', 'PendingActionCallbackApiResponse'),
    internalCapability(pmsCapabilityManifestOperation, 'GET', '/v1/pms/capabilities/manifest', undefined, 'PmsCapabilityManifest'),
    internalCapability('pms_sandbox_readback', 'GET', '/v1/sandbox/readback', undefined, 'PmsSandboxReadback'),
    internalCapability('pms_sandbox_reset', 'POST', '/v1/sandbox/reset', undefined, 'PmsSandboxReadback'),
  ];
}

function reservationDraftCapability(
  operation: PmsReservationDraftWorkflowOperation,
  path: string,
  capabilityClass: Extract<PmsCapabilityClass, 'draft' | 'prepareConfirm'>,
  requestSchemaRef: string,
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  return workflowCapability(operation, path, capabilityClass, requestSchemaRef, 'ReservationDraftWorkflowApiResponse', 'reservationDraft', slots);
}

function reservationGroupDraftCapability(
  operation: PmsReservationGroupDraftWorkflowOperation,
  path: string,
  capabilityClass: Extract<PmsCapabilityClass, 'draft' | 'prepareConfirm'>,
  requestSchemaRef: string,
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  return workflowCapability(operation, path, capabilityClass, requestSchemaRef, 'ReservationGroupDraftWorkflowApiResponse', 'reservationGroupDraft', slots);
}

function workflowCapability(
  operation: PmsReservationDraftWorkflowOperation | PmsReservationGroupDraftWorkflowOperation | PmsReservationCancelWorkflowOperation | PmsReservationCreateWorkflowOperation | PmsReservationAdjustWorkflowOperation,
  path: string,
  capabilityClass: Extract<PmsCapabilityClass, 'draft' | 'prepareConfirm'>,
  requestSchemaRef: string,
  responseSchemaRef: string,
  workflow: string,
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: capabilityClass,
    customerChatAllowed: true,
    naturalLanguageExecutable: true,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: responseSchemaRef },
    slots,
    refs: { workflow },
    idempotency: { required: true, keyField: 'clientToken', fingerprintRequired: true, replaySafe: true },
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path, operation, auth: 'bearer-token' },
  });
}

function readCapability(
  operation: string,
  path: string,
  requestSchemaRef: string,
  responseSchemaRef: string,
  slots: PmsCapabilityManifestItem['slots'],
  readModel: string,
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: 'read',
    customerChatAllowed: true,
    naturalLanguageExecutable: true,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: responseSchemaRef },
    slots,
    refs: { readModel },
    idempotency: { required: false, fingerprintRequired: false, replaySafe: true },
    audit: { auditRequired: false, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path, operation, auth: 'bearer-token' },
  });
}

function operationRequestSafeIntakeCapability(options: {
  readonly operation: PmsOperationRequestOperation;
  readonly path: string;
  readonly requestSchemaRef: string;
  readonly responseSchemaRef: string;
  readonly customerChatAllowed: boolean;
  readonly naturalLanguageExecutable: boolean;
  readonly slots: PmsCapabilityManifestItem['slots'];
  readonly idempotency: PmsCapabilityManifestItem['idempotency'];
}): PmsCapabilityManifestItem {
  return capability({
    name: options.operation,
    class: 'safeIntake',
    customerChatAllowed: options.customerChatAllowed,
    naturalLanguageExecutable: options.naturalLanguageExecutable,
    confirmationRequired: false,
    schemaRefs: { request: options.requestSchemaRef, response: options.responseSchemaRef },
    slots: options.slots,
    refs: { readModel: 'OperationRequest' },
    idempotency: options.idempotency,
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method: 'POST', path: options.path, operation: options.operation, auth: 'bearer-token' },
  });
}

function commandCapability(
  operation: PmsCommandOperation,
  commandType: PmsCapabilityManifestItem['refs']['commandType'],
  path: string,
  mode: PmsApiMode,
  eventTypes: readonly string[],
  slots: PmsCapabilityManifestItem['slots'],
): PmsCapabilityManifestItem {
  const isConfirm = mode === 'confirm';
  return capability({
    name: `${operation}.${mode}`,
    class: isConfirm ? 'confirm' : 'dryRun',
    customerChatAllowed: !isConfirm,
    naturalLanguageExecutable: !isConfirm,
    confirmationRequired: isConfirm,
    schemaRefs: { request: `${commandSchemaStem(operation)}${isConfirm ? 'Confirm' : 'DryRun'}ApiRequest`, response: `${commandSchemaStem(operation)}ApiResponse` },
    slots,
    refs: { commandType, domainEvents: eventTypes },
    idempotency: { required: true, keyField: 'idempotencyKey', fingerprintRequired: true, replaySafe: true },
    audit: { auditRequired: isConfirm, emitsDomainEvents: isConfirm, eventTypes: isConfirm ? eventTypes : [] },
    endpoint: { method: 'POST', path, operation, mode, auth: 'bearer-token' },
  });
}

function commandSchemaStem(operation: PmsCommandOperation): string {
  if (operation === pmsCheckInOperation) return 'CheckIn';
  if (operation === pmsCheckOutOperation) return 'CheckOut';
  if (operation === pmsHousekeepingDoneOperation) return 'HousekeepingDone';
  if (operation === pmsHousekeepingInspectionOperation) return 'HousekeepingInspection';
  if (operation === pmsHousekeepingReworkOperation) return 'HousekeepingRework';
  if (operation === pmsHousekeepingMarkDirtyOperation) return 'HousekeepingMarkDirty';
  if (operation === pmsReportMaintenanceOperation) return 'ReportMaintenance';
  if (operation === pmsMaintenanceDoneOperation) return 'MaintenanceDone';
  return 'RestoreSellable';
}

function internalCapability(
  operation: string,
  method: PmsCapabilityManifestItem['endpoint']['method'],
  path: string,
  requestSchemaRef: string | undefined,
  responseSchemaRef: string,
): PmsCapabilityManifestItem {
  return capability({
    name: operation,
    class: 'internal',
    customerChatAllowed: false,
    naturalLanguageExecutable: false,
    confirmationRequired: false,
    schemaRefs: { request: requestSchemaRef, response: responseSchemaRef },
    slots: [],
    refs: {},
    idempotency: { required: false, fingerprintRequired: false, replaySafe: false },
    audit: { auditRequired: true, emitsDomainEvents: false, eventTypes: [] },
    endpoint: { method, path, operation, auth: 'bearer-token' },
  });
}

function capability(options: {
  readonly name: string;
  readonly class: PmsCapabilityClass;
  readonly customerChatAllowed: boolean;
  readonly naturalLanguageExecutable: boolean;
  readonly confirmationRequired: boolean;
  readonly schemaRefs: PmsCapabilityManifestItem['schemaRefs'];
  readonly slots: PmsCapabilityManifestItem['slots'];
  readonly refs: PmsCapabilityManifestItem['refs'];
  readonly idempotency: PmsCapabilityManifestItem['idempotency'];
  readonly audit: PmsCapabilityManifestItem['audit'];
  readonly endpoint: PmsCapabilityManifestItem['endpoint'];
}): PmsCapabilityManifestItem {
  return {
    version: 'v1',
    ...options,
  };
}

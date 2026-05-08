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

describe('API checkout contract skeleton - api-reservation-workflow', () => {
  it('returns typed reservation draft safe gaps without final PMS mutations', () => {
      const createRequest: ReservationDraftCreateApiRequest = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: checkoutContractFixtures.actor,
        source: 'api',
        clientToken: 'reservation-draft-create-1',
        requestFingerprint: 'sha256:reservation-draft-create-1',
        correlationId: 'corr-reservation-draft-create-1',
        requestedAt: '2026-05-02T00:00:00.000Z',
        slots: { guestDisplayName: 'Guest A', arrivalDate: '2026-05-04', departureDate: '2026-05-05' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-search-1' }],
      };
      const prepareRequest: ReservationPrepareConfirmApiRequest = {
        ...createRequest,
        operation: pmsReservationPrepareConfirmOperation,
        clientToken: 'reservation-draft-prepare-1',
        requestFingerprint: 'sha256:reservation-draft-prepare-1',
        draftId: 'draft-1',
        quoteRef: 'quote-1',
      };
  
      expect(executeReservationDraftWorkflowApiRequest(createRequest)).toMatchObject({
        ok: false,
        operation: 'pms.reservation.draft.create',
        status: 'notImplemented',
        mutationStatus: 'none',
        gap: { code: 'RESERVATION_DRAFT_WORKFLOW_NOT_IMPLEMENTED', owner: 'pms-platform', mutationStatus: 'none' },
        draft: { workflowType: 'reservation', status: 'collectingSlots', evidenceRefs: [{ refId: 'availability-search-1' }] },
      });
      expect(executeReservationDraftWorkflowApiRequest(prepareRequest)).toMatchObject({
        ok: false,
        operation: 'pms.reservation.prepare_confirm',
        mutationStatus: 'none',
        draft: { draftId: 'draft-1' },
      });
    });
  
    
  
  it('returns typed reservation group draft safe gaps without final PMS mutations', () => {
      const createRequest: ReservationGroupDraftCreateApiRequest = {
        operation: pmsReservationGroupDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: checkoutContractFixtures.actor,
        source: 'api',
        clientToken: 'reservation-group-draft-create-1',
        requestFingerprint: 'sha256:reservation-group-draft-create-1',
        correlationId: 'corr-reservation-group-draft-create-1',
        requestedAt: '2026-05-02T00:00:00.000Z',
        slots: {
          guestDisplayName: 'Guest Group',
          arrivalDate: '2026-05-04',
          departureDate: '2026-05-05',
          quantity: 2,
          selections: [
            { roomId: 'room-1001', selectedCandidateRef: 'availability-search-1:room-1001' },
            { roomId: 'room-1002', selectedCandidateRef: 'availability-search-1:room-1002' },
          ],
        },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-search-1' }],
      };
      const prepareRequest: ReservationGroupPrepareConfirmApiRequest = {
        ...createRequest,
        operation: pmsReservationGroupPrepareConfirmOperation,
        clientToken: 'reservation-group-draft-prepare-1',
        requestFingerprint: 'sha256:reservation-group-draft-prepare-1',
        groupDraftId: 'group-draft-1',
        quoteRef: 'group-quote-1',
      };
  
      expect(executeReservationGroupDraftWorkflowApiRequest(createRequest)).toMatchObject({
        ok: false,
        operation: 'pms.reservation.group_draft.create',
        status: 'notImplemented',
        mutationStatus: 'none',
        gap: { code: 'RESERVATION_GROUP_DRAFT_WORKFLOW_NOT_IMPLEMENTED', owner: 'pms-platform', mutationStatus: 'none' },
        groupDraft: { workflowType: 'reservationGroup', status: 'collectingSlots', evidenceRefs: [{ refId: 'availability-search-1' }] },
      });
      expect(executeReservationGroupDraftWorkflowApiRequest(prepareRequest)).toMatchObject({
        ok: false,
        operation: 'pms.reservation.group_prepare_confirm',
        mutationStatus: 'none',
        groupDraft: { groupDraftId: 'group-draft-1' },
      });
    });
  
    
});

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

describe('API checkout contract skeleton - api-readmodel', () => {
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
  
    
  
  it('derives future availability search from inventory day-room truth', () => {
      const inventory: InventoryReadModel = {
        schemaVersion: pmsProjectionSchemaVersion,
        generatedAt: '2026-05-02T00:00:00.000Z',
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        horizonDays: 1,
        summaryStatus: 'fresh',
        blocks: [],
        dayRooms: [
          {
            businessDate: '2026-05-04',
            propertyId: 'property-small-hotel',
            roomId: 'room-garden-1',
            roomNumber: 'G1',
            roomTypeId: 'room-type-garden-villa',
            roomType: '花园别墅',
            availabilityStatus: 'available',
            sourceRefs: [{ sourceType: 'room_status', sourceId: 'room-garden-1', label: 'sellable room' }],
            updatedAt: '2026-05-02T00:00:00.000Z',
          },
          {
            businessDate: '2026-05-04',
            propertyId: 'property-small-hotel',
            roomId: 'room-garden-2',
            roomNumber: 'G2',
            roomTypeId: 'room-type-garden-suite',
            roomType: '花园套房',
            availabilityStatus: 'reserved',
            sourceRefs: [{ sourceType: 'reservation', sourceId: 'reservation-1', label: 'R-1' }],
            updatedAt: '2026-05-02T00:00:00.000Z',
          },
          {
            businessDate: '2026-05-04',
            propertyId: 'property-small-hotel',
            roomId: 'room-cave-1',
            roomNumber: 'C1',
            roomTypeId: 'room-type-cave',
            roomType: '秘境洞穴',
            availabilityStatus: 'available',
            sourceRefs: [{ sourceType: 'room_status', sourceId: 'room-cave-1', label: 'sellable room' }],
            updatedAt: '2026-05-02T00:00:00.000Z',
          },
        ],
        intervals: [],
        summaries: [{
          businessDate: '2026-05-04',
          propertyId: 'property-small-hotel',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          totalRooms: 1,
          availableRooms: 1,
          occupiedRooms: 0,
          blockedRooms: 0,
          reservedRooms: 0,
          updatedAt: '2026-05-02T00:00:00.000Z',
        }],
        projectionFreshness: {
          status: 'fresh',
          generatedAt: '2026-05-02T00:00:00.000Z',
          note: 'pms-read-model-current',
        },
      };
  
      const response = executeAvailabilitySearchApiRequest({
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-05-04',
        roomTypeKeyword: '花园',
        count: 1,
        requestedAt: '2026-05-02T00:00:00.000Z',
      }, inventory);
      const capacityGap = executeAvailabilitySearchApiRequest({
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-05-04',
        capacity: 3,
        requestedAt: '2026-05-02T00:00:00.000Z',
      }, inventory);
      const unsupportedRoomType = executeAvailabilitySearchApiRequest({
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-05-04',
        roomTypeKeyword: '大床',
        requestedAt: '2026-05-02T00:00:00.000Z',
      }, inventory);
      const caveByRoomTypeId = executeAvailabilitySearchApiRequest({
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-05-04',
        roomTypeId: 'room-type-cave',
        requestedAt: '2026-05-02T00:00:00.000Z',
      }, inventory);
  
      expect(response).toMatchObject({
        ok: true,
        operation: 'pms_availability_search',
        readModel: {
          request: { startDate: '2026-05-04', endDate: '2026-05-05', roomTypeKeyword: '花园', unsupportedFilters: [] },
          candidates: [{
            roomId: 'room-garden-1',
            roomTypeId: 'room-type-garden-villa',
            roomType: '花园别墅',
            availableDates: ['2026-05-04'],
            sourceRefs: [{ sourceType: 'room_status', sourceId: 'room-garden-1', label: 'sellable room' }],
          }],
          candidateCount: 1,
          truncated: false,
        },
      });
      expect(capacityGap.readModel).toMatchObject({
        request: { unsupportedFilters: ['capacity'] },
        candidates: [],
        candidateCount: 0,
      });
      expect(unsupportedRoomType.readModel).toMatchObject({
        request: { roomTypeKeyword: '大床', unsupportedFilters: [] },
        candidates: [],
        candidateCount: 0,
      });
      expect(JSON.stringify(unsupportedRoomType)).not.toContain('大床房');
      expect(caveByRoomTypeId.readModel).toMatchObject({
        request: { roomTypeId: 'room-type-cave', unsupportedFilters: [] },
        candidates: [{ roomId: 'room-cave-1', roomTypeId: 'room-type-cave', roomType: '秘境洞穴' }],
        candidateCount: 1,
      });
    });
  
    
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsMaintenanceDoneOperation,
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
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type MaintenanceDoneApiRequest,
  type OperationRequestCreateApiRequest,
  type ReportMaintenanceApiRequest,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
  type RestoreSellableApiRequest,
} from '../src/index.js';
import {
  createSqliteLocalSandboxStore,
  pmsSqliteDbPathEnvName,
} from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A1',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const vacantCleanRoom: RoomAggregate = {
  roomId: 'room-A2',
  roomNumber: 'A2',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A2',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const vacantCleanRoomB: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
};

const dryRunRequest: CheckOutDryRunApiRequest = {
  operation: pmsCheckOutOperation,
  mode: 'dryRun',
  roomId: 'room-1001',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest departed and returned room cards.',
  idempotencyKey: 'sqlite-dry-run-room-1001',
  correlationId: 'corr-sqlite-room-1001',
  requestedAt: '2026-04-28T00:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-dry-run-room-1001',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-confirm-room-1001',
  requestFingerprint: 'sha256:sqlite-confirm-room-1001',
};

const checkInDryRunRequest: CheckInDryRunApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'dryRun',
  roomId: 'room-A2',
  reservationId: 'res-A2-checkin',
  reservationCode: 'R-A2-CHECKIN',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest arrived with verified reservation.',
  idempotencyKey: 'sqlite-checkin-dry-run-room-A2',
  correlationId: 'corr-sqlite-checkin-room-A2',
  requestedAt: '2026-04-28T15:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-checkin-dry-run-room-A2',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  ...checkInDryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-checkin-confirm-room-A2',
  requestFingerprint: 'sha256:sqlite-checkin-confirm-room-A2',
};

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite local sandbox store - sqlite-dispatch-store', () => {
  it('persists operation_requests idempotently without mutating PMS state', () => {
      const dbPath = tempPath('operation-requests.sqlite');
      const store = createSqliteLocalSandboxStore({
        dbPath,
        seedRooms: [dueOutRoom],
        resetOnStart: true,
        now: () => now,
      });
      const request: OperationRequestCreateApiRequest = {
        propertyId: 'property-small-hotel',
        clientToken: 'form-checkout-room-1001',
        requestFingerprint: 'sha256:form-checkout-room-1001',
        source: 'external_form',
        action: 'CHECK_OUT',
        roomId: 'room-1001',
        roomNumber: '1001',
        reservationId: 'reservation-1001',
        payload: { roomNumber: '1001', action: 'CHECK_OUT' },
        requestedAt: now,
      };
  
      const beforeInventory = store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 });
      const created = store.createOperationRequest(request);
      const duplicate = store.createOperationRequest(request);
      const mismatch = store.createOperationRequest({
        ...request,
        requestFingerprint: 'sha256:form-checkout-room-1001-different',
        payload: { roomNumber: '1001', action: 'CHECK_OUT', note: 'different payload' },
      });
      const unsupported = store.createOperationRequest({
        ...request,
        clientToken: 'form-delete-room-1001',
        requestFingerprint: 'sha256:form-delete-room-1001',
        action: 'DELETE_ROOM',
      });
  
      expect(created).toMatchObject({
        ok: true,
        operation: 'pms_operation_request_create',
        idempotencyStatus: 'created',
        request: {
          propertyId: 'property-small-hotel',
          clientToken: 'form-checkout-room-1001',
          action: 'CHECK_OUT',
          status: 'queued',
          roomId: 'room-1001',
          roomNumber: '1001',
        },
      });
      expect(duplicate).toEqual({ ...created, idempotencyStatus: 'replayed' });
      expect(mismatch).toEqual({
        ok: false,
        operation: 'pms_operation_request_create',
        errors: [
          {
            code: 'OPERATION_REQUEST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
            message: 'The operation request client token was reused with a different request fingerprint or payload.',
            field: 'requestFingerprint',
          },
        ],
      });
      expect(unsupported).toMatchObject({
        ok: false,
        errors: [{ code: 'OPERATION_REQUEST_UNSUPPORTED_ACTION', field: 'action' }],
      });
  
      const updated = store.updateOperationRequest({
        clientToken: 'form-checkout-room-1001',
        status: 'awaitingConfirmation',
        result: { dryRun: 'ready' },
        updatedAt: '2026-04-28T00:01:00.000Z',
      });
      expect(updated).toMatchObject({
        ok: true,
        operation: 'pms_operation_request_update',
        request: {
          clientToken: 'form-checkout-room-1001',
          status: 'awaitingConfirmation',
          resultJson: '{"dryRun":"ready"}',
        },
      });
      expect(store.getOperationRequest({ clientToken: 'form-checkout-room-1001' }).request).toMatchObject({
        status: 'awaitingConfirmation',
        resultJson: '{"dryRun":"ready"}',
      });
      expect(store.listOperationRequests({ status: 'awaitingConfirmation', roomId: 'room-1001', limit: 1, requestedAt: '2026-04-28T00:02:00.000Z' })).toMatchObject({
        ok: true,
        operation: 'pms_operation_request_list',
        count: 1,
        truncated: false,
        updatedAt: '2026-04-28T00:02:00.000Z',
        filter: { status: 'awaitingConfirmation', roomId: 'room-1001', limit: 1 },
        requests: [{ clientToken: 'form-checkout-room-1001', status: 'awaitingConfirmation', roomId: 'room-1001' }],
      });
      store.updateOperationRequest({
        clientToken: 'form-checkout-room-1001',
        status: 'failed',
        result: { errorCode: 'adapter_delivery_failed' },
        updatedAt: '2026-04-28T00:03:00.000Z',
      });
  
      const readback = store.readback('room-1001');
      expect(readback.operationRequests).toEqual([expect.objectContaining({ status: 'failed', resultJson: '{"errorCode":"adapter_delivery_failed"}' })]);
      expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'operationRequest', projectionKind: 'operationRequestStatus', status: 'retryable', nextAttemptAt: '2026-04-28T00:03:00.000Z', redactedError: 'operation-request-status:failed' }),
      ]));
      expect(readback.rooms).toEqual([dueOutRoom]);
      expect(readback.housekeepingTasks).toEqual([]);
      expect(readback.maintenanceTickets).toEqual([]);
      expect(readback.audits).toEqual([]);
      expect(readback.domainEvents).toEqual([]);
      expect(store.inventoryIntervals({ roomId: 'room-1001', startDate: '2026-04-28', horizonDays: 1 })).toEqual(beforeInventory);
      store.close();
  
      const restarted = createSqliteLocalSandboxStore({
        dbPath,
        seedRooms: [],
        resetOnStart: false,
        now: () => now,
      });
      expect(restarted.getOperationRequest({ clientToken: 'form-checkout-room-1001' }).request).toMatchObject({
        clientToken: 'form-checkout-room-1001',
        status: 'failed',
      });
      expect(restarted.readback('room-1001').projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'operationRequest', status: 'retryable' }),
      ]));
      expect(restarted.readback('room-1001').rooms).toEqual([dueOutRoom]);
      restarted.close();
    });
  
    
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

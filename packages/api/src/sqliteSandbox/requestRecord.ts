import { createHash } from 'node:crypto';
import {
  type AuditEntry,
  type DomainEvent,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryCalendarKind,
  type InventoryDayRoom,
  type InventoryIntervalProjection,
  type InventorySellableStatus,
  type InventorySourceRef,
  type InventorySummaryDayType,
  type OperationRequest,
  type ReservationDraftAuditRef,
  type ReservationDraftEvidenceRef,
  type ReservationDraftMissingSlot,
  type PendingActionReadModel,
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftStatus,
  type ReservationDraftWorkflowRef,
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftEvidenceRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftStatus,
  type ReservationGroupDraftWorkflowRef,
  type ReservationReadModel,
  type StayStatus,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsHousekeepingInspectionOperation,
  pmsHousekeepingReworkOperation,
  pmsMaintenanceDoneOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsRestoreSellableOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestUpdateOperation,
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
  type OperationRequestCreateApiResponse,
  type OperationRequestUpdateApiResponse,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
  type ReservationDraftWorkflowApiResponse,
  type ReservationGroupDraftCancelApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationGroupDraftUpdateApiRequest,
  type ReservationGroupDraftWorkflowApiResponse,
  type ReservationGroupPrepareConfirmApiRequest,
  type ReservationGroupQuoteApiRequest,
} from '../index.js';
import {
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxStayReadback,
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchStatus,
  type PmsSandboxIdempotencyReadback,
} from '../localSandbox.js';

export function operationRequestCreateErrorResponse(code: ApiErrorCode, message: string, field: string): OperationRequestCreateApiResponse {
  return {
    ok: false,
    operation: pmsOperationRequestCreateOperation,
    errors: [{ code, message, field }],
  };
}

export function operationRequestUpdateErrorResponse(code: ApiErrorCode, message: string, field: string): OperationRequestUpdateApiResponse {
  return {
    ok: false,
    operation: pmsOperationRequestUpdateOperation,
    errors: [{ code, message, field }],
  };
}

export function requestOperationFromRecord(record: ApiIdempotencyRecord): PmsSandboxIdempotencyReadback['operation'] {
  return record.response.ok && (
    record.response.operation === pmsCheckInOperation ||
    record.response.operation === pmsCheckOutOperation ||
    record.response.operation === pmsHousekeepingDoneOperation ||
    record.response.operation === pmsHousekeepingInspectionOperation ||
    record.response.operation === pmsHousekeepingReworkOperation ||
    record.response.operation === pmsReportMaintenanceOperation ||
    record.response.operation === pmsMaintenanceDoneOperation ||
    record.response.operation === pmsRestoreSellableOperation ||
    record.response.operation === pmsReservationDraftCreateOperation ||
    record.response.operation === pmsReservationDraftUpdateOperation ||
    record.response.operation === pmsReservationQuoteOperation ||
    record.response.operation === pmsReservationPrepareConfirmOperation ||
    record.response.operation === pmsReservationDraftCancelOperation ||
    record.response.operation === pmsReservationGroupDraftCreateOperation ||
    record.response.operation === pmsReservationGroupDraftUpdateOperation ||
    record.response.operation === pmsReservationGroupQuoteOperation ||
    record.response.operation === pmsReservationGroupPrepareConfirmOperation ||
    record.response.operation === pmsReservationGroupDraftCancelOperation ||
    record.response.operation === pmsPendingActionStatusOperation ||
    record.response.operation === pmsPendingActionConfirmOperation ||
    record.response.operation === pmsPendingActionCancelOperation
  )
    ? record.response.operation
    : 'unknown';
}

export function requestModeFromRecord(record: ApiIdempotencyRecord): PmsSandboxIdempotencyReadback['mode'] {
  if (record.response.ok && 'mode' in record.response) return record.response.mode;
  if (record.response.ok && record.response.mutationStatus === 'draftOnly') return 'draft';
  if (record.response.ok && 'pendingAction' in record.response) return 'confirm';
  return 'mode' in record.response && (record.response.mode === 'dryRun' || record.response.mode === 'confirm') ? record.response.mode : 'unknown';
}

export function requestJsonFromRecord(record: ApiIdempotencyRecord): unknown {
  if (record.response.ok && 'request' in record.response) return record.response.request.fingerprintInput;
  if (record.response.ok && record.response.mutationStatus === 'draftOnly' && 'draft' in record.response) return { operation: record.response.operation, draftRef: record.response.draft.draftRef };
  if (record.response.ok && record.response.mutationStatus === 'draftOnly' && 'groupDraft' in record.response) return { operation: record.response.operation, groupDraftRef: record.response.groupDraft.groupDraftRef };
  if (record.response.ok && 'pendingAction' in record.response) return { operation: record.response.operation, pendingActionRef: record.response.pendingAction.pendingActionRef };
  return 'mode' in record.response ? { mode: record.response.mode } : { operation: record.response.operation };
}

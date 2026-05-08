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

export function addHoursIso(timestamp: string, hours: number): string {
  return new Date(new Date(timestamp).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function businessDateRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (let date = startDate; date < endDate; date = addBusinessDays(date, 1)) {
    days.push(date);
  }
  return days;
}

export function dateInRange(businessDate: string, startDate: string, endDate: string): boolean {
  return businessDate >= normalizeBusinessDate(startDate) && businessDate < normalizeBusinessDate(endDate);
}

export function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return normalizeBusinessDate(leftStart) < normalizeBusinessDate(rightEnd) && normalizeBusinessDate(rightStart) < normalizeBusinessDate(leftEnd);
}

export function normalizeInventoryHorizonDays(value: number | undefined): number {
  if (value === 30 || value === 60 || value === 90) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(90, Math.max(1, Math.trunc(value)));
  }
  return 60;
}

export function addBusinessDays(startDate: string, days: number): string {
  const date = new Date(`${normalizeBusinessDate(startDate)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeBusinessDate(value: string): string {
  return value.slice(0, 10);
}

export function sameBusinessDate(value: string, businessDate: string): boolean {
  return value.slice(0, 10) === businessDate.slice(0, 10);
}

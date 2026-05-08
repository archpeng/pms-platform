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

import { stableJsonStringify } from './json.js';
import { type StoredReservationDraft, type StoredReservationGroupDraft } from './rows.js';
export function stableRefHash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

export function reservationGroupDraftIdFromClientToken(clientToken: string): string {
  const digest = createHash('sha256').update(clientToken).digest('hex').slice(0, 12);
  return `group-draft-${sanitizeSlug(clientToken).slice(0, 42)}-${digest}`;
}

export function reservationGroupDraftRef(groupDraftId: string): string {
  return createHash('sha256').update(`reservation-group-draft:${groupDraftId}`).digest('hex').slice(0, 16);
}

export function reservationGroupQuoteRef(draft: StoredReservationGroupDraft): string {
  return reservationDraftDerivedRef('group-quote', `${draft.groupDraftId}:${stableJsonStringify(draft.slots)}:${stableJsonStringify(draft.evidenceRefs)}`);
}

export function reservationGroupDraftAuditId(groupDraftId: string, action: string, occurredAt: string, sequence: number): string {
  const digest = createHash('sha256').update(`${groupDraftId}:${action}:${occurredAt}:${sequence}`).digest('hex').slice(0, 12);
  return `audit-${sanitizeSlug(action).slice(0, 24)}-${digest}`;
}

export function reservationDraftIdFromClientToken(clientToken: string): string {
  const digest = createHash('sha256').update(clientToken).digest('hex').slice(0, 12);
  return `draft-${sanitizeSlug(clientToken).slice(0, 48)}-${digest}`;
}

export function reservationDraftRef(draftId: string): string {
  return createHash('sha256').update(`reservation-draft:${draftId}`).digest('hex').slice(0, 16);
}

export function reservationIdFromDraft(draft: StoredReservationDraft): string {
  return `reservation-${reservationDraftRef(draft.draftId)}`;
}

export function reservationCodeFromDraft(draft: StoredReservationDraft): string {
  return `R-${reservationDraftRef(draft.draftId).toUpperCase()}`;
}

export function reservationQuoteRef(draft: StoredReservationDraft): string {
  return reservationDraftDerivedRef('quote', `${draft.draftId}:${stableJsonStringify(draft.slots)}:${stableJsonStringify(draft.evidenceRefs)}`);
}

export function reservationDraftDerivedRef(prefix: string, input: string): string {
  const digest = createHash('sha256').update(input).digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}

export function reservationDraftAuditId(draftId: string, action: string, occurredAt: string, sequence: number): string {
  const digest = createHash('sha256').update(`${draftId}:${action}:${occurredAt}:${sequence}`).digest('hex').slice(0, 12);
  return `audit-${sanitizeSlug(action).slice(0, 24)}-${digest}`;
}

export function operationRequestIdFromClientToken(clientToken: string): string {
  const digest = createHash('sha256').update(clientToken).digest('hex').slice(0, 12);
  return `opreq-${sanitizeSlug(clientToken).slice(0, 48)}-${digest}`;
}

export function stayIdForCheckIn(reservationId: string, roomId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${reservationId}:${roomId}:${idempotencyKey}`).digest('hex').slice(0, 12);
  return `stay-${sanitizeSlug(reservationId).slice(0, 32)}-${sanitizeSlug(roomId).slice(0, 24)}-${digest}`;
}

export function stayIdForReservationRoom(reservationId: string, roomId: string): string {
  const digest = createHash('sha256').update(`${reservationId}:${roomId}`).digest('hex').slice(0, 12);
  return `stay-${sanitizeSlug(reservationId).slice(0, 32)}-${sanitizeSlug(roomId).slice(0, 24)}-${digest}`;
}

export function nonEmptyString(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

export function optionalString(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

export function operationRequestListLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

import {
  isOperationRequestSource,
  isOperationRequestStatus,
  isSupportedOperationRequestAction,
  type AuditEntry,
  type DomainEvent,
  type HousekeepingTask,
  type InventoryAvailabilityStatus,
  type InventoryBlock,
  type InventoryDayRoom,
  type InventoryHorizonRequest,
  type InventoryIntervalProjection,
  type InventoryReadModel,
  type InventorySummaryDayType,
  type MaintenanceTicket,
  type OperationRequest,
  type ProjectionOutboxEntry,
  type ReservationDraftAuditRef,
  type ReservationDraftEvidenceRef,
  type ReservationDraftMissingSlot,
  type PendingActionReadModel,
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftWorkflowRef,
  type ReservationGroupDraftAuditRef,
  type ReservationGroupDraftEvidenceRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftWorkflowRef,
  type ReservationGroupRoomSelection,
  type ReservationReadModel,
  type RoomReservationContextReadModel,
  type StayStatus,
  type TodayReservationsReadModel,
} from '@pms-platform/contracts';
import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
  type CorePmsCommandConfirmResult,
  type CorePorts,
  type DomainEventCollector,
  type IdempotencyRepository,
  type RoomAggregate,
} from '@pms-platform/core';
import {
  pmsOperationRequestCreateOperation,
  pmsOperationRequestGetOperation,
  pmsOperationRequestListOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type ApiErrorCode,
  type ApiIdempotencyRecord,
  type ApiIdempotencyRepository,
  type CheckInApiRequest,
  type CheckInConfirmApiRequest,
  type CheckOutConfirmApiRequest,
  type OperationRequestCreateApiRequest,
  type OperationRequestCreateApiResponse,
  type OperationRequestGetApiRequest,
  type OperationRequestGetApiResponse,
  type OperationRequestListApiRequest,
  type OperationRequestListApiResponse,
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
  type OperationRequestUpdateApiRequest,
  type OperationRequestUpdateApiResponse,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
  type PendingActionCancelApiRequest,
  type PendingActionConfirmApiRequest,
  type PendingActionStatusApiRequest,
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
  pmsSandboxStateVersion,
  type PmsSandboxPropertyReadback,
  type PmsSandboxReservationAllocationReadback,
  type PmsSandboxReservationImportRecord,
  type PmsSandboxRoomTypeReadback,
  type PmsSandboxStayReadback,
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchListOptions,
  type ProjectionDispatchMarkOptions,
  type ProjectionDispatchStatus,
  type ProjectionDispatchWorkItem,
  type PmsSandboxReadback,
} from '../localSandbox.js';
import { deriveProjectionOutboxEntries } from './projectionOutbox.js';
import {
  ApiIdempotencyRow,
  InventoryBlockRow,
  InventoryDayRoomRow,
  InventoryIntervalProjectionRow,
  InventorySummaryDayTypeRow,
  JsonPayloadRow,
  OperationRequestRow,
  ProjectionDispatchLedgerRow,
  ReservationDraftAuditPayloadRow,
  ReservationDraftAuditRow,
  ReservationDraftRow,
  ReservationGroupDraftAuditPayloadRow,
  ReservationGroupDraftRow,
  ReservationRow,
  RoomRow,
  StayRow,
  StoredReservationDraft,
  StoredReservationGroupDraft,
  addBusinessDays,
  addHoursIso,
  apiIdempotencyFromRow,
  businessDateRange,
  cloneValue,
  compressInventoryIntervals,
  createProjectionFreshness,
  dateInRange,
  dateRangesOverlap,
  deriveGroupMissingSlots,
  deriveMissingSlots,
  draftStatusFromMissingSlots,
  findOccupiedStayForRoomDate,
  findReservedAllocationForRoomDate,
  findReservedReservationForRoomDate,
  groupDraftStatusFromMissingSlots,
  hasCompleteGroupSelections,
  housekeepingTaskIdFromEvent,
  inventoryBlockFromRow,
  inventoryBlockOverlaps,
  inventoryDayRoomForStatus,
  inventoryDayRoomFromRow,
  inventoryIntervalFromDayRoom,
  inventoryIntervalProjectionFromRow,
  inventorySummaryDayTypeFromRow,
  isPendingActionCallbackResponse,
  mergeEvidenceRefs,
  nonEmptyString,
  normalizeBusinessDate,
  normalizeInventoryHorizonDays,
  normalizeStayStatus,
  operationRequestCreateErrorResponse,
  operationRequestFromRow,
  operationRequestIdFromClientToken,
  operationRequestListLimit,
  operationRequestUpdateErrorResponse,
  optionalString,
  parseJson,
  pendingActionCardPayloadMismatchResponse,
  pendingActionCardPayloadMismatchResponseFromGroup,
  pendingActionExpiredResponse,
  pendingActionExpiredResponseFromGroup,
  pendingActionFallbackOperation,
  pendingActionInactiveResponse,
  pendingActionInactiveResponseFromGroup,
  pendingActionNotFoundResponse,
  pendingActionReadModelFromDraft,
  pendingActionReadModelFromGroupDraft,
  pendingActionRejectedResponse,
  pendingActionSuccessResponse,
  pendingActionSuccessResponseFromGroup,
  pendingActionTokenConflictResponse,
  projectionDispatchLedgerFromRow,
  propertyCodeFromPropertyId,
  propertyDisplayName,
  propertyTimezone,
  redactedPendingActionAuditPayload,
  requestJsonFromRecord,
  requestModeFromRecord,
  requestOperationFromRecord,
  reservationCodeFromDraft,
  reservationDraftAuditId,
  reservationDraftDerivedRef,
  reservationDraftFromRow,
  reservationDraftIdFromClientToken,
  reservationDraftInactiveResponse,
  reservationDraftMissingSlotsResponse,
  reservationDraftNotFoundResponse,
  reservationDraftPendingAction,
  reservationDraftQuote,
  reservationDraftQuoteMismatchResponse,
  reservationDraftQuoteRequiredResponse,
  reservationDraftRef,
  reservationDraftRefFromStored,
  reservationDraftRejectedResponse,
  reservationDraftSuccessResponse,
  reservationDraftTokenConflictResponse,
  reservationGroupDraftAuditId,
  reservationGroupDraftFromRow,
  reservationGroupDraftIdFromClientToken,
  reservationGroupDraftInactiveResponse,
  reservationGroupDraftMissingSlotsResponse,
  reservationGroupDraftNotFoundResponse,
  reservationGroupDraftPendingAction,
  reservationGroupDraftQuote,
  reservationGroupDraftQuoteMismatchResponse,
  reservationGroupDraftQuoteRequiredResponse,
  reservationGroupDraftRef,
  reservationGroupDraftRefFromStored,
  reservationGroupDraftRejectedResponse,
  reservationGroupDraftSuccessResponse,
  reservationGroupDraftTokenConflictResponse,
  reservationGroupQuoteRef,
  reservationIdFromDraft,
  reservationQuoteRef,
  roomFromRow,
  roomIdFromEvent,
  roomTypeCodeFromRoomTypeId,
  roomTypeDisplayName,
  roomTypeIdFromDisplayName,
  sameBusinessDate,
  sameInventoryInterval,
  sanitizeSlug,
  stableJsonStringify,
  stableRefHash,
  stayFromRow,
  stayIdForCheckIn,
  stayIdForReservationRoom,
  summarizeInventoryDayRooms,
  toStableJsonValue
} from './model.js';
import { SqliteSandboxInventoryStore } from './inventoryStore.js';

export abstract class SqliteSandboxWorkflowTablesStore extends SqliteSandboxInventoryStore {
  protected getReservationDraftById(draftId: string): StoredReservationDraft | undefined {
    const row = this.db.prepare('SELECT * FROM reservation_drafts WHERE draft_id = ?').get(draftId) as ReservationDraftRow | undefined;
    return row ? reservationDraftFromRow(row) : undefined;
  }

  protected getReservationDraftByContext(request: ReservationDraftUpdateApiRequest | ReservationQuoteApiRequest | ReservationPrepareConfirmApiRequest | ReservationDraftCancelApiRequest): StoredReservationDraft | undefined {
    if (request.draftRef) return this.listStoredReservationDrafts().find((draft) => reservationDraftRef(draft.draftId) === request.draftRef);
    return request.draftId ? this.getReservationDraftById(request.draftId) : undefined;
  }

  protected getReservationDraftByPendingActionRef(pendingActionRef: string): StoredReservationDraft | undefined {
    return this.listStoredReservationDrafts().find((draft) => draft.pendingAction?.pendingActionRef === pendingActionRef);
  }

  protected listStoredReservationDrafts(): StoredReservationDraft[] {
    const rows = this.db
      .prepare('SELECT * FROM reservation_drafts ORDER BY created_at, draft_id')
      .all() as unknown as ReservationDraftRow[];
    return rows.map(reservationDraftFromRow);
  }

  protected listReservationDrafts(): ReservationDraftWorkflowRef[] {
    return this.listStoredReservationDrafts().map((draft) => reservationDraftRefFromStored(draft, [], { includeDraftId: true }));
  }

  protected saveReservationDraft(draft: StoredReservationDraft): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_drafts (
            draft_id, property_id, client_token, request_fingerprint, status, slots_json,
            missing_slots_json, evidence_refs_json, quote_json, pending_action_json, expires_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(draft_id) DO UPDATE SET
            client_token = excluded.client_token,
            request_fingerprint = excluded.request_fingerprint,
            status = excluded.status,
            slots_json = excluded.slots_json,
            missing_slots_json = excluded.missing_slots_json,
            evidence_refs_json = excluded.evidence_refs_json,
            quote_json = excluded.quote_json,
            pending_action_json = excluded.pending_action_json,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        draft.draftId,
        draft.propertyId,
        draft.clientToken,
        draft.requestFingerprint,
        draft.status,
        JSON.stringify(draft.slots),
        JSON.stringify(draft.missingSlots),
        JSON.stringify(draft.evidenceRefs),
        draft.quote ? JSON.stringify(draft.quote) : null,
        draft.pendingAction ? JSON.stringify(draft.pendingAction) : null,
        draft.expiresAt,
        draft.createdAt,
        draft.updatedAt,
      );
  }

  protected appendReservationDraftAudit(
    draftId: string,
    action: ReservationDraftAuditRef['action'],
    occurredAt: string,
    payload: unknown,
  ): ReservationDraftAuditRef {
    const auditRef: ReservationDraftAuditRef = {
      auditId: reservationDraftAuditId(draftId, action, occurredAt, this.listReservationDraftAudits().length + 1),
      action,
      occurredAt,
    };
    this.db
      .prepare(
        `
          INSERT INTO reservation_draft_audits (audit_id, draft_id, action, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(auditRef.auditId, draftId, action, occurredAt, JSON.stringify(payload));
    return auditRef;
  }

  protected listReservationDraftAudits(): ReservationDraftAuditRef[] {
    const rows = this.db
      .prepare('SELECT audit_id, action, occurred_at FROM reservation_draft_audits ORDER BY occurred_at, audit_id')
      .all() as unknown as ReservationDraftAuditRow[];
    return rows.map((row) => ({
      auditId: row.audit_id,
      action: row.action,
      occurredAt: row.occurred_at,
    }));
  }

  protected getReservationGroupDraftById(groupDraftId: string): StoredReservationGroupDraft | undefined {
    const row = this.db.prepare('SELECT * FROM reservation_group_drafts WHERE group_draft_id = ?').get(groupDraftId) as ReservationGroupDraftRow | undefined;
    return row ? reservationGroupDraftFromRow(row) : undefined;
  }

  protected getReservationGroupDraftByContext(request: ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest): StoredReservationGroupDraft | undefined {
    if (request.groupDraftRef) return this.listStoredReservationGroupDrafts().find((draft) => reservationGroupDraftRef(draft.groupDraftId) === request.groupDraftRef);
    return request.groupDraftId ? this.getReservationGroupDraftById(request.groupDraftId) : undefined;
  }

  protected getReservationGroupDraftByPendingActionRef(pendingActionRef: string): StoredReservationGroupDraft | undefined {
    return this.listStoredReservationGroupDrafts().find((draft) => draft.pendingAction?.pendingActionRef === pendingActionRef);
  }

  protected listStoredReservationGroupDrafts(): StoredReservationGroupDraft[] {
    const rows = this.db
      .prepare('SELECT * FROM reservation_group_drafts ORDER BY created_at, group_draft_id')
      .all() as unknown as ReservationGroupDraftRow[];
    return rows.map(reservationGroupDraftFromRow);
  }

  protected listReservationGroupDrafts(): ReservationGroupDraftWorkflowRef[] {
    return this.listStoredReservationGroupDrafts().map((draft) => reservationGroupDraftRefFromStored(draft, [], { includeGroupDraftId: true }));
  }

  protected saveReservationGroupDraft(draft: StoredReservationGroupDraft): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_group_drafts (
            group_draft_id, property_id, client_token, request_fingerprint, status, slots_json,
            missing_slots_json, evidence_refs_json, quote_json, pending_action_json, expires_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(group_draft_id) DO UPDATE SET
            client_token = excluded.client_token,
            request_fingerprint = excluded.request_fingerprint,
            status = excluded.status,
            slots_json = excluded.slots_json,
            missing_slots_json = excluded.missing_slots_json,
            evidence_refs_json = excluded.evidence_refs_json,
            quote_json = excluded.quote_json,
            pending_action_json = excluded.pending_action_json,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        draft.groupDraftId,
        draft.propertyId,
        draft.clientToken,
        draft.requestFingerprint,
        draft.status,
        JSON.stringify(draft.slots),
        JSON.stringify(draft.missingSlots),
        JSON.stringify(draft.evidenceRefs),
        draft.quote ? JSON.stringify(draft.quote) : null,
        draft.pendingAction ? JSON.stringify(draft.pendingAction) : null,
        draft.expiresAt,
        draft.createdAt,
        draft.updatedAt,
      );
  }

  protected appendReservationGroupDraftAudit(
    groupDraftId: string,
    action: ReservationGroupDraftAuditRef['action'],
    occurredAt: string,
    payload: unknown,
  ): ReservationGroupDraftAuditRef {
    const auditRef: ReservationGroupDraftAuditRef = {
      auditId: reservationGroupDraftAuditId(groupDraftId, action, occurredAt, this.listReservationGroupDraftAudits().length + 1),
      action,
      occurredAt,
    };
    this.db
      .prepare(
        `
          INSERT INTO reservation_group_draft_audits (audit_id, group_draft_id, action, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(auditRef.auditId, groupDraftId, action, occurredAt, JSON.stringify(payload));
    return auditRef;
  }

  protected listReservationGroupDraftAudits(): ReservationGroupDraftAuditRef[] {
    const rows = this.db
      .prepare('SELECT audit_id, action, occurred_at FROM reservation_group_draft_audits ORDER BY occurred_at, audit_id')
      .all() as unknown as ReservationDraftAuditRow[];
    return rows.map((row) => ({
      auditId: row.audit_id,
      action: row.action,
      occurredAt: row.occurred_at,
    }));
  }
}

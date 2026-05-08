import {
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
  type ReservationDraftPendingActionRef,
  type ReservationDraftQuoteRef,
  type ReservationDraftSlots,
  type ReservationDraftStatus,
  type ReservationGroupDraftEvidenceRef,
  type ReservationGroupDraftMissingSlot,
  type ReservationGroupDraftPendingActionRef,
  type ReservationGroupDraftQuoteRef,
  type ReservationGroupDraftSlots,
  type ReservationGroupDraftStatus,
  type ReservationReadModel,
  type StayStatus,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import { type ApiIdempotencyRecord } from '../index.js';
import {
  type PmsSandboxStayReadback,
  type ProjectionDispatchLedgerEntry,
  type ProjectionDispatchStatus,
} from '../localSandbox/model.js';

import { parseJson } from './json.js';
export interface RoomRow {
  readonly room_id: string;
  readonly room_number: string;
  readonly property_id?: string | null;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly zone?: string | null;
  readonly sort_key?: string | null;
  readonly occupancy_status: RoomAggregate['occupancyStatus'];
  readonly cleaning_status: RoomAggregate['cleaningStatus'];
  readonly sale_status: RoomAggregate['saleStatus'];
}

export interface JsonPayloadRow {
  readonly payload_json: string;
}

export interface ApiIdempotencyRow {
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly response_json: string;
}

export interface ReservationDraftRow {
  readonly draft_id: string;
  readonly property_id: string;
  readonly client_token: string;
  readonly request_fingerprint: string;
  readonly status: ReservationDraftStatus;
  readonly slots_json: string;
  readonly missing_slots_json: string;
  readonly evidence_refs_json: string;
  readonly quote_json?: string | null;
  readonly pending_action_json?: string | null;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReservationDraftAuditRow {
  readonly audit_id: string;
  readonly action: ReservationDraftAuditRef['action'];
  readonly occurred_at: string;
}

export interface ReservationDraftAuditPayloadRow extends ReservationDraftAuditRow {
  readonly draft_id: string;
  readonly payload_json: string;
}

export interface ReservationGroupDraftAuditPayloadRow extends ReservationDraftAuditRow {
  readonly group_draft_id: string;
  readonly payload_json: string;
}

export interface ProjectionDispatchLedgerRow {
  readonly outbox_entry_id: string;
  readonly status: ProjectionDispatchStatus;
  readonly attempt_count: number;
  readonly adapter_operation?: string | null;
  readonly adapter_status_code?: number | null;
  readonly last_attempt_at?: string | null;
  readonly next_attempt_at?: string | null;
  readonly redacted_error?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReservationGroupDraftRow {
  readonly group_draft_id: string;
  readonly property_id: string;
  readonly client_token: string;
  readonly request_fingerprint: string;
  readonly status: ReservationGroupDraftStatus;
  readonly slots_json: string;
  readonly missing_slots_json: string;
  readonly evidence_refs_json: string;
  readonly quote_json?: string | null;
  readonly pending_action_json?: string | null;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StoredReservationGroupDraft {
  readonly groupDraftId: string;
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly status: ReservationGroupDraftStatus;
  readonly slots: ReservationGroupDraftSlots;
  readonly missingSlots: readonly ReservationGroupDraftMissingSlot[];
  readonly evidenceRefs: readonly ReservationGroupDraftEvidenceRef[];
  readonly quote?: ReservationGroupDraftQuoteRef;
  readonly pendingAction?: ReservationGroupDraftPendingActionRef;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoredReservationDraft {
  readonly draftId: string;
  readonly propertyId: string;
  readonly clientToken: string;
  readonly requestFingerprint: string;
  readonly status: ReservationDraftStatus;
  readonly slots: ReservationDraftSlots;
  readonly missingSlots: readonly ReservationDraftMissingSlot[];
  readonly evidenceRefs: readonly ReservationDraftEvidenceRef[];
  readonly quote?: ReservationDraftQuoteRef;
  readonly pendingAction?: ReservationDraftPendingActionRef;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OperationRequestRow {
  readonly operation_request_id: string;
  readonly property_id: string;
  readonly client_token: string;
  readonly request_fingerprint: string;
  readonly source: OperationRequest['source'];
  readonly action: OperationRequest['action'];
  readonly status: OperationRequest['status'];
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly reservation_id?: string | null;
  readonly payload_json: string;
  readonly result_json?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReservationRow {
  readonly reservation_id: string;
  readonly reservation_code: string;
  readonly property_id: string;
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly display_name: string;
  readonly arrival_date: string;
  readonly departure_date: string;
  readonly status: ReservationReadModel['status'];
}

export interface StayRow {
  readonly stay_id: string;
  readonly reservation_id: string;
  readonly reservation_code?: string | null;
  readonly room_id?: string | null;
  readonly room_number?: string | null;
  readonly checked_in_at?: string | null;
  readonly checked_out_at?: string | null;
  readonly status: string;
}

export interface InventoryBlockRow {
  readonly block_id: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_type_id?: string | null;
  readonly block_type: InventoryBlock['blockType'];
  readonly start_date: string;
  readonly end_date?: string | null;
  readonly status: InventoryBlock['status'];
  readonly source_type: InventoryBlock['sourceType'];
  readonly source_id: string;
  readonly reason: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at?: string | null;
}

export interface InventoryDayRoomRow {
  readonly business_date: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_number: string;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly availability_status: InventoryAvailabilityStatus;
  readonly source_refs_json: string;
  readonly updated_at: string;
}

export interface InventoryIntervalProjectionRow {
  readonly projection_id: string;
  readonly property_id: string;
  readonly room_id: string;
  readonly room_number: string;
  readonly room_type_id?: string | null;
  readonly room_type?: string | null;
  readonly start_date: string;
  readonly end_date: string;
  readonly calendar_kind: InventoryCalendarKind;
  readonly sellable_status: InventorySellableStatus;
  readonly title: string;
  readonly source_refs_json: string;
  readonly updated_at: string;
}

export interface InventorySummaryDayTypeRow {
  readonly business_date: string;
  readonly property_id: string;
  readonly room_type_id: string;
  readonly room_type?: string | null;
  readonly total_rooms: number;
  readonly available_rooms: number;
  readonly occupied_rooms: number;
  readonly blocked_rooms: number;
  readonly reserved_rooms: number;
  readonly updated_at: string;
}

export function roomFromRow(row: RoomRow): RoomAggregate {
  return {
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    ...(row.zone ? { zone: row.zone } : {}),
    ...(row.sort_key ? { sortKey: row.sort_key } : {}),
    occupancyStatus: row.occupancy_status,
    cleaningStatus: row.cleaning_status,
    saleStatus: row.sale_status,
  };
}

export function inventoryBlockFromRow(row: InventoryBlockRow): InventoryBlock {
  return {
    blockId: row.block_id,
    propertyId: row.property_id,
    roomId: row.room_id,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    blockType: row.block_type,
    startDate: row.start_date,
    ...(row.end_date ? { endDate: row.end_date } : {}),
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
  };
}

export function inventoryDayRoomFromRow(
  row: InventoryDayRoomRow,
): InventoryDayRoom {
  return {
    businessDate: row.business_date,
    propertyId: row.property_id,
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    availabilityStatus: row.availability_status,
    sourceRefs: parseJson<InventorySourceRef[]>(row.source_refs_json),
    updatedAt: row.updated_at,
  };
}

export function inventoryIntervalProjectionFromRow(
  row: InventoryIntervalProjectionRow,
): InventoryIntervalProjection {
  return {
    projectionId: row.projection_id,
    propertyId: row.property_id,
    roomId: row.room_id,
    roomNumber: row.room_number,
    ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
    ...(row.room_type ? { roomType: row.room_type } : {}),
    startDate: row.start_date,
    endDate: row.end_date,
    calendarKind: row.calendar_kind,
    sellableStatus: row.sellable_status,
    title: row.title,
    sourceRefs: parseJson<InventorySourceRef[]>(row.source_refs_json),
    updatedAt: row.updated_at,
  };
}

export function inventorySummaryDayTypeFromRow(
  row: InventorySummaryDayTypeRow,
): InventorySummaryDayType {
  return {
    businessDate: row.business_date,
    propertyId: row.property_id,
    roomTypeId: row.room_type_id,
    ...(row.room_type ? { roomType: row.room_type } : {}),
    totalRooms: row.total_rooms,
    availableRooms: row.available_rooms,
    occupiedRooms: row.occupied_rooms,
    blockedRooms: row.blocked_rooms,
    reservedRooms: row.reserved_rooms,
    updatedAt: row.updated_at,
  };
}

export function apiIdempotencyFromRow(
  row: ApiIdempotencyRow,
): ApiIdempotencyRecord {
  return {
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    response: parseJson<ApiIdempotencyRecord['response']>(row.response_json),
  };
}

export function reservationDraftFromRow(
  row: ReservationDraftRow,
): StoredReservationDraft {
  return {
    draftId: row.draft_id,
    propertyId: row.property_id,
    clientToken: row.client_token,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    slots: parseJson<ReservationDraftSlots>(row.slots_json),
    missingSlots: parseJson<ReservationDraftMissingSlot[]>(
      row.missing_slots_json,
    ),
    evidenceRefs: parseJson<ReservationDraftEvidenceRef[]>(
      row.evidence_refs_json,
    ),
    ...(row.quote_json
      ? { quote: parseJson<ReservationDraftQuoteRef>(row.quote_json) }
      : {}),
    ...(row.pending_action_json
      ? {
          pendingAction: parseJson<ReservationDraftPendingActionRef>(
            row.pending_action_json,
          ),
        }
      : {}),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function reservationGroupDraftFromRow(
  row: ReservationGroupDraftRow,
): StoredReservationGroupDraft {
  return {
    groupDraftId: row.group_draft_id,
    propertyId: row.property_id,
    clientToken: row.client_token,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    slots: parseJson<ReservationGroupDraftSlots>(row.slots_json),
    missingSlots: parseJson<ReservationGroupDraftMissingSlot[]>(
      row.missing_slots_json,
    ),
    evidenceRefs: parseJson<ReservationGroupDraftEvidenceRef[]>(
      row.evidence_refs_json,
    ),
    ...(row.quote_json
      ? { quote: parseJson<ReservationGroupDraftQuoteRef>(row.quote_json) }
      : {}),
    ...(row.pending_action_json
      ? {
          pendingAction: parseJson<ReservationGroupDraftPendingActionRef>(
            row.pending_action_json,
          ),
        }
      : {}),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function operationRequestFromRow(
  row: OperationRequestRow,
): OperationRequest {
  return {
    operationRequestId: row.operation_request_id,
    propertyId: row.property_id,
    clientToken: row.client_token,
    requestFingerprint: row.request_fingerprint,
    source: row.source,
    action: row.action,
    status: row.status,
    ...(row.room_id ? { roomId: row.room_id } : {}),
    ...(row.room_number ? { roomNumber: row.room_number } : {}),
    ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
    payloadJson: row.payload_json,
    ...(row.result_json ? { resultJson: row.result_json } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function projectionDispatchLedgerFromRow(
  row: ProjectionDispatchLedgerRow,
): ProjectionDispatchLedgerEntry {
  return {
    outboxEntryId: row.outbox_entry_id,
    status: row.status,
    attemptCount: row.attempt_count,
    ...(row.adapter_operation
      ? { adapterOperation: row.adapter_operation }
      : {}),
    ...(row.adapter_status_code !== null &&
    row.adapter_status_code !== undefined
      ? { adapterStatusCode: row.adapter_status_code }
      : {}),
    ...(row.last_attempt_at ? { lastAttemptAt: row.last_attempt_at } : {}),
    ...(row.next_attempt_at ? { nextAttemptAt: row.next_attempt_at } : {}),
    ...(row.redacted_error ? { redactedError: row.redacted_error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function stayFromRow(row: StayRow): PmsSandboxStayReadback {
  return {
    stayId: row.stay_id,
    reservationId: row.reservation_id,
    ...(row.reservation_code ? { reservationCode: row.reservation_code } : {}),
    ...(row.room_id ? { roomId: row.room_id } : {}),
    ...(row.room_number ? { roomNumber: row.room_number } : {}),
    ...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
    ...(row.checked_out_at ? { checkedOutAt: row.checked_out_at } : {}),
    status: normalizeStayStatus(row.status),
  };
}

export function normalizeStayStatus(value: string): StayStatus {
  return value === 'checkedOut' ? 'checkedOut' : 'inHouse';
}

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
import { SqliteSandboxReservationStore } from './reservationStore.js';

export abstract class SqliteSandboxInventoryStore extends SqliteSandboxReservationStore {
  rebuildInventory(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.runInTransaction(() => this.rebuildInventoryHorizon(options));
  }

  inventoryIntervals(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  inventorySummary(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    return this.rebuildInventory(options);
  }

  protected rebuildInventoryHorizon(options: Partial<InventoryHorizonRequest> = {}): InventoryReadModel {
    const generatedAt = this.now();
    const startDate = normalizeBusinessDate(options.startDate ?? generatedAt);
    const horizonDays = normalizeInventoryHorizonDays(options.horizonDays);
    const endDate = addBusinessDays(startDate, horizonDays);
    const rooms = this.listRooms();
    const reservations = this.listReservations();
    const reservationsById = new Map(reservations.map((reservation) => [reservation.reservationId, reservation]));
    const allocations = this.listReservationAllocations();
    const stays = this.listStays();
    const allBlocks = this.listInventoryBlocks();

    this.clearInventoryDerivedTables(startDate, endDate);

    const dayRooms: InventoryDayRoom[] = [];
    for (const businessDate of businessDateRange(startDate, endDate)) {
      for (const room of rooms) {
        const dayRoom = this.deriveInventoryDayRoom({
          businessDate,
          endDate,
          room,
          blocks: allBlocks,
          reservationsById,
          allocations,
          stays,
          updatedAt: generatedAt,
        });
        this.saveInventoryDayRoom(dayRoom);
        dayRooms.push(dayRoom);
      }
    }

    for (const interval of compressInventoryIntervals(dayRooms, generatedAt)) {
      this.saveInventoryIntervalProjection(interval);
    }
    for (const summary of summarizeInventoryDayRooms(dayRooms, generatedAt)) {
      this.saveInventorySummaryDayType(summary);
    }

    this.inventoryDirty = false;
    const filteredDayRooms = this.listInventoryDayRooms(startDate, endDate, options.roomId);
    const summaryRoomTypeIds = options.roomId ? new Set(filteredDayRooms.map((row) => row.roomTypeId ?? 'room-type-unknown')) : undefined;
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt,
      startDate,
      endDate,
      horizonDays,
      summaryStatus: 'fresh',
      blocks: this.listInventoryBlocks(options.roomId),
      dayRooms: filteredDayRooms,
      intervals: this.listInventoryIntervalProjection(startDate, endDate, options.roomId),
      summaries: this.listInventorySummaryDayType(startDate, endDate, summaryRoomTypeIds),
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }

  protected deriveInventoryDayRoom(input: {
    readonly businessDate: string;
    readonly endDate: string;
    readonly room: RoomAggregate;
    readonly blocks: readonly InventoryBlock[];
    readonly reservationsById: ReadonlyMap<string, ReservationReadModel>;
    readonly allocations: readonly PmsSandboxReservationAllocationReadback[];
    readonly stays: readonly PmsSandboxStayReadback[];
    readonly updatedAt: string;
  }): InventoryDayRoom {
    const activeBlock = input.blocks.find((block) => block.roomId === input.room.roomId && block.status === 'active' && dateInRange(input.businessDate, block.startDate, block.endDate ?? input.endDate));
    const occupiedStay = findOccupiedStayForRoomDate(input.stays, input.reservationsById, input.room.roomId, input.businessDate);
    const reservedAllocation = findReservedAllocationForRoomDate(input.allocations, input.reservationsById, input.room.roomId, input.businessDate);
    const reservedReservation = reservedAllocation ? undefined : findReservedReservationForRoomDate(input.reservationsById, input.room.roomId, input.businessDate);
    const propertyId = input.room.propertyId ?? 'property-small-hotel';

    if (activeBlock) {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'blocked', [{ sourceType: 'inventory_block', sourceId: activeBlock.blockId, label: activeBlock.reason }], input.updatedAt);
    }
    if (input.room.saleStatus !== 'sellable') {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'blocked', [{ sourceType: 'room_status', sourceId: input.room.roomId, label: input.room.saleStatus }], input.updatedAt);
    }
    if (occupiedStay) {
      const reservation = input.reservationsById.get(occupiedStay.reservationId);
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'occupied', [{ sourceType: 'stay', sourceId: occupiedStay.stayId, label: reservation?.reservationCode }], input.updatedAt);
    }
    if (reservedAllocation) {
      const reservation = input.reservationsById.get(reservedAllocation.reservationId);
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'reserved', [{ sourceType: 'reservation', sourceId: reservedAllocation.reservationId, label: reservation?.reservationCode }], input.updatedAt);
    }
    if (reservedReservation) {
      return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'reserved', [{ sourceType: 'reservation', sourceId: reservedReservation.reservationId, label: reservedReservation.reservationCode }], input.updatedAt);
    }
    return inventoryDayRoomForStatus(input.room, propertyId, input.businessDate, 'available', [], input.updatedAt);
  }

  protected clearInventoryDerivedTables(startDate: string, endDate: string): void {
    this.db.prepare('DELETE FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ?').run(startDate, endDate);
    this.db.prepare('DELETE FROM inventory_interval_projection WHERE start_date < ? AND end_date > ?').run(endDate, startDate);
    this.db.prepare('DELETE FROM inventory_day_room WHERE business_date >= ? AND business_date < ?').run(startDate, endDate);
  }

  protected listInventoryBlocks(roomId?: string): InventoryBlock[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_blocks WHERE room_id = ? ORDER BY start_date, block_id').all(roomId) as unknown as InventoryBlockRow[]
      : this.db.prepare('SELECT * FROM inventory_blocks ORDER BY start_date, block_id').all() as unknown as InventoryBlockRow[];
    return rows.map(inventoryBlockFromRow);
  }

  protected getInventoryBlockBySource(sourceType: InventoryBlock['sourceType'], sourceId: string, roomId: string, blockType: InventoryBlock['blockType']): InventoryBlock | undefined {
    const row = this.db
      .prepare('SELECT * FROM inventory_blocks WHERE source_type = ? AND source_id = ? AND room_id = ? AND block_type = ?')
      .get(sourceType, sourceId, roomId, blockType) as InventoryBlockRow | undefined;
    return row ? inventoryBlockFromRow(row) : undefined;
  }

  protected upsertInventoryBlock(block: InventoryBlock): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_blocks (
            block_id, property_id, room_id, room_type_id, block_type, start_date, end_date, status,
            source_type, source_id, reason, created_at, updated_at, closed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_type, source_id, room_id, block_type) DO UPDATE SET
            property_id = excluded.property_id,
            room_type_id = excluded.room_type_id,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            reason = excluded.reason,
            updated_at = excluded.updated_at,
            closed_at = excluded.closed_at
        `,
      )
      .run(
        block.blockId,
        block.propertyId,
        block.roomId,
        block.roomTypeId ?? null,
        block.blockType,
        block.startDate,
        block.endDate ?? null,
        block.status,
        block.sourceType,
        block.sourceId,
        block.reason,
        block.createdAt,
        block.updatedAt,
        block.closedAt ?? null,
      );
    this.inventoryDirty = true;
  }

  protected upsertMaintenanceInventoryBlock(ticket: MaintenanceTicket): void {
    if (!ticket.stopSellRequested) {
      return;
    }
    const existing = this.getInventoryBlockBySource('maintenance_ticket', ticket.ticketId, ticket.roomId, 'repair');
    if (existing?.status === 'closed') {
      return;
    }
    const room = this.getRoom(ticket.roomId);
    const timestamp = this.now();
    this.upsertInventoryBlock({
      blockId: existing?.blockId ?? `block-${ticket.ticketId}`,
      propertyId: room?.propertyId ?? 'property-small-hotel',
      roomId: ticket.roomId,
      ...(room?.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
      blockType: 'repair',
      startDate: normalizeBusinessDate(ticket.createdAt),
      status: 'active',
      sourceType: 'maintenance_ticket',
      sourceId: ticket.ticketId,
      reason: ticket.reason,
      createdAt: existing?.createdAt ?? ticket.createdAt,
      updatedAt: timestamp,
    });
  }

  protected closeActiveStopSellBlocks(roomId: string, timestamp: string): void {
    const closeDate = normalizeBusinessDate(timestamp);
    const result = this.db
      .prepare(
        `
          UPDATE inventory_blocks
          SET status = 'closed', end_date = ?, closed_at = ?, updated_at = ?
          WHERE room_id = ? AND status = 'active' AND block_type = 'repair' AND source_type = 'maintenance_ticket'
        `,
      )
      .run(closeDate, timestamp, timestamp, roomId);
    if (result.changes > 0) {
      this.inventoryDirty = true;
    }
  }

  protected saveInventoryDayRoom(row: InventoryDayRoom): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_day_room (
            business_date, property_id, room_id, room_number, room_type_id, room_type, availability_status, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, room_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            availability_status = excluded.availability_status,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(row.businessDate, row.propertyId, row.roomId, row.roomNumber, row.roomTypeId ?? null, row.roomType ?? null, row.availabilityStatus, JSON.stringify(row.sourceRefs), row.updatedAt);
  }

  protected listInventoryDayRooms(startDate: string, endDate: string, roomId?: string): InventoryDayRoom[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? AND room_id = ? ORDER BY business_date, room_id').all(startDate, endDate, roomId) as unknown as InventoryDayRoomRow[]
      : this.db.prepare('SELECT * FROM inventory_day_room WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_id').all(startDate, endDate) as unknown as InventoryDayRoomRow[];
    return rows.map(inventoryDayRoomFromRow);
  }

  protected saveInventoryIntervalProjection(interval: InventoryIntervalProjection): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_interval_projection (
            projection_id, property_id, room_id, room_number, room_type_id, room_type, start_date, end_date,
            calendar_kind, sellable_status, title, source_refs_json, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(projection_id) DO UPDATE SET
            property_id = excluded.property_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            calendar_kind = excluded.calendar_kind,
            sellable_status = excluded.sellable_status,
            title = excluded.title,
            source_refs_json = excluded.source_refs_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        interval.projectionId,
        interval.propertyId,
        interval.roomId,
        interval.roomNumber,
        interval.roomTypeId ?? null,
        interval.roomType ?? null,
        interval.startDate,
        interval.endDate,
        interval.calendarKind,
        interval.sellableStatus,
        interval.title,
        JSON.stringify(interval.sourceRefs),
        interval.updatedAt,
      );
  }

  protected listInventoryIntervalProjection(startDate: string, endDate: string, roomId?: string): InventoryIntervalProjection[] {
    const rows = roomId
      ? this.db.prepare('SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? AND room_id = ? ORDER BY start_date, room_id, projection_id').all(endDate, startDate, roomId) as unknown as InventoryIntervalProjectionRow[]
      : this.db.prepare('SELECT * FROM inventory_interval_projection WHERE start_date < ? AND end_date > ? ORDER BY start_date, room_id, projection_id').all(endDate, startDate) as unknown as InventoryIntervalProjectionRow[];
    return rows.map(inventoryIntervalProjectionFromRow);
  }

  protected saveInventorySummaryDayType(summary: InventorySummaryDayType): void {
    this.db
      .prepare(
        `
          INSERT INTO inventory_summary_day_type (
            business_date, property_id, room_type_id, room_type, total_rooms, available_rooms, occupied_rooms, blocked_rooms, reserved_rooms, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_date, property_id, room_type_id) DO UPDATE SET
            room_type = excluded.room_type,
            total_rooms = excluded.total_rooms,
            available_rooms = excluded.available_rooms,
            occupied_rooms = excluded.occupied_rooms,
            blocked_rooms = excluded.blocked_rooms,
            reserved_rooms = excluded.reserved_rooms,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        summary.businessDate,
        summary.propertyId,
        summary.roomTypeId,
        summary.roomType ?? null,
        summary.totalRooms,
        summary.availableRooms,
        summary.occupiedRooms,
        summary.blockedRooms,
        summary.reservedRooms,
        summary.updatedAt,
      );
  }

  protected listInventorySummaryDayType(startDate: string, endDate: string, roomTypeIds?: ReadonlySet<string>): InventorySummaryDayType[] {
    const rows = this.db
      .prepare('SELECT * FROM inventory_summary_day_type WHERE business_date >= ? AND business_date < ? ORDER BY business_date, room_type_id')
      .all(startDate, endDate) as unknown as InventorySummaryDayTypeRow[];
    return rows.map(inventorySummaryDayTypeFromRow).filter((row) => !roomTypeIds || roomTypeIds.has(row.roomTypeId));
  }
}

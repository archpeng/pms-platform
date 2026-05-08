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
import { SqliteSandboxCoreStore } from './coreStore.js';

export abstract class SqliteSandboxReservationStore extends SqliteSandboxCoreStore {
  abstract readback(roomId?: string): PmsSandboxReadback;

  reset(
    seedRooms: readonly RoomAggregate[] = this.seedRooms,
    seedReservations: readonly PmsSandboxReservationImportRecord[] = this.seedReservations,
  ): PmsSandboxReadback {
    this.runInTransaction(() => {
      this.clearBusinessTables();
      this.seedCatalogFromRooms(seedRooms);
      for (const room of seedRooms) {
        this.saveRoom(room);
      }
      this.importReservations(seedReservations);
    });
    return this.readback();
  }

  importReservations(reservations: readonly PmsSandboxReservationImportRecord[]) {
    return this.runInTransaction(() => {
      const imported: ReservationReadModel[] = [];
      for (const reservation of reservations) {
        imported.push(this.saveReservationImportRecord(reservation));
      }
      return {
        importedCount: imported.length,
        reservations: imported,
      };
    });
  }

  recordCheckInStay(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() => this.recordCheckInStayFromConfirm(request, result));
  }

  recordCheckOutStay(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() => this.recordCheckOutStayFromConfirm(request, result));
  }

  getReservation(reservationCode: string, requestedAt: string): ReservationReadModel | undefined {
    const row = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode) as ReservationRow | undefined;
    return row ? this.reservationReadModelFromRow(row, requestedAt) : undefined;
  }

  todayArrivals(businessDate: string, requestedAt: string): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations()
        .filter((reservation) => reservation.status !== 'cancelled' && sameBusinessDate(reservation.arrivalDate, businessDate)),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  todayDepartures(businessDate: string, requestedAt: string): TodayReservationsReadModel {
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      businessDate,
      summaryStatus: 'fresh',
      reservations: this.listReservations()
        .filter((reservation) => reservation.status !== 'cancelled' && sameBusinessDate(reservation.departureDate, businessDate)),
      projectionFreshness: createProjectionFreshness(requestedAt, 'fresh'),
    };
  }

  roomReservationContext(roomId: string, requestedAt: string): RoomReservationContextReadModel {
    const room = this.getRoom(roomId);
    const reservations = this.listReservationsByRoomIds(new Set([roomId]));
    return {
      schemaVersion: 'pms-dashboard-mvp-v1',
      generatedAt: requestedAt,
      roomId,
      ...(room?.roomNumber ? { roomNumber: room.roomNumber } : {}),
      ...(room?.roomType ? { roomType: room.roomType } : {}),
      reservations,
      projectionFreshness: createProjectionFreshness(requestedAt, room ? 'fresh' : 'unavailable'),
    };
  }

  protected listReservations(): ReservationReadModel[] {
    const rows = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          ORDER BY r.arrival_date, r.reservation_code
        `,
      )
      .all() as unknown as ReservationRow[];
    return rows.map((row) => this.reservationReadModelFromRow(row, this.now()));
  }

  protected listReservationsByRoomIds(roomIds: ReadonlySet<string>): ReservationReadModel[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservations().filter((reservation) => {
      if (reservation.roomId && roomIds.has(reservation.roomId)) {
        return true;
      }
      const allocation = this.getLatestReservationAllocation(reservation.reservationId);
      return Boolean(allocation?.roomId && roomIds.has(allocation.roomId));
    });
  }

  protected listReservationAllocations(): PmsSandboxReservationAllocationReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          ORDER BY start_date, allocation_id
        `,
      )
      .all() as Array<{
        allocation_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        room_type_id?: string | null;
        room_type?: string | null;
        start_date: string;
        end_date: string;
        status: string;
      }>;
    return rows.map((row) => ({
      allocationId: row.allocation_id,
      reservationId: row.reservation_id,
      ...(row.room_id ? { roomId: row.room_id } : {}),
      ...(row.room_number ? { roomNumber: row.room_number } : {}),
      ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
      ...(row.room_type ? { roomType: row.room_type } : {}),
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    }));
  }

  protected listReservationAllocationsByRoomIds(roomIds: ReadonlySet<string>): PmsSandboxReservationAllocationReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listReservationAllocations().filter((allocation) => allocation.roomId && roomIds.has(allocation.roomId));
  }

  protected listStays(): PmsSandboxStayReadback[] {
    const rows = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          ORDER BY s.created_at, s.stay_id
        `,
      )
      .all() as unknown as StayRow[];
    return rows.map(stayFromRow);
  }

  protected listStaysByRoomIds(roomIds: ReadonlySet<string>): PmsSandboxStayReadback[] {
    if (roomIds.size === 0) {
      return [];
    }
    return this.listStays().filter((stay) => stay.roomId && roomIds.has(stay.roomId));
  }

  protected saveReservationImportRecord(record: PmsSandboxReservationImportRecord): ReservationReadModel {
    const guestId = `guest-${record.reservationId}`;
    const createdAt = this.now();
    const room = record.roomId ? this.getRoom(record.roomId) : undefined;
    const propertyId = record.propertyId || room?.propertyId || 'property-small-hotel';
    const roomTypeId = record.roomTypeId ?? room?.roomTypeId;
    const roomType = record.roomType ?? room?.roomType;
    this.ensureCatalogForRoom({
      roomId: record.roomId ?? `room-import-${record.reservationCode}`,
      roomNumber: record.roomNumber ?? room?.roomNumber ?? record.reservationCode,
      propertyId,
      roomTypeId,
      roomType,
      zone: room?.zone,
      sortKey: room?.sortKey,
      occupancyStatus: room?.occupancyStatus ?? 'vacant',
      cleaningStatus: room?.cleaningStatus ?? 'clean',
      saleStatus: room?.saleStatus ?? 'sellable',
    });
    this.db
      .prepare(
        `
          INSERT INTO guests (guest_id, display_name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guest_id) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at
        `,
      )
      .run(guestId, record.guestDisplayName, createdAt, createdAt);
    this.db
      .prepare(
        `
          INSERT INTO reservations (
            reservation_id, reservation_code, property_id, guest_id, room_id, room_number,
            room_type_id, room_type, arrival_date, departure_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reservation_id) DO UPDATE SET
            reservation_code = excluded.reservation_code,
            property_id = excluded.property_id,
            guest_id = excluded.guest_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            arrival_date = excluded.arrival_date,
            departure_date = excluded.departure_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.reservationId,
        record.reservationCode,
        propertyId,
        guestId,
        record.roomId ?? null,
        record.roomNumber ?? null,
        roomTypeId ?? null,
        roomType ?? null,
        record.arrivalDate,
        record.departureDate,
        record.status,
        createdAt,
        createdAt,
      );
    this.inventoryDirty = true;

    if (record.allocation || record.roomId || record.roomNumber) {
      const allocation = {
        allocationId: record.allocation?.allocationId ?? `alloc-${record.reservationId}`,
        roomId: record.allocation?.roomId ?? record.roomId ?? room?.roomId,
        roomNumber: record.allocation?.roomNumber ?? record.roomNumber ?? room?.roomNumber,
        roomTypeId: record.allocation?.roomTypeId ?? roomTypeId,
        roomType: record.allocation?.roomType ?? roomType,
        startDate: record.allocation?.startDate ?? record.arrivalDate,
        endDate: record.allocation?.endDate ?? record.departureDate,
        status: record.allocation?.status ?? 'allocated',
      };
      this.saveReservationAllocation(record.reservationId, allocation, createdAt);
    }

    if (record.stay) {
      this.saveStay(record.reservationId, {
        stayId: record.stay.stayId ?? stayIdForReservationRoom(record.reservationId, record.stay.roomId ?? record.roomId ?? room?.roomId ?? 'unknown'),
        roomId: record.stay.roomId ?? record.roomId ?? room?.roomId,
        roomNumber: record.stay.roomNumber ?? record.roomNumber ?? room?.roomNumber,
        checkedInAt: record.stay.checkedInAt,
        checkedOutAt: record.stay.checkedOutAt,
        status: record.stay.status ?? (record.stay.checkedOutAt ? 'checkedOut' : 'inHouse'),
      }, createdAt);
    }

    const row = this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
    )
      .get(record.reservationId) as unknown as ReservationRow;
    return this.reservationReadModelFromRow(row, createdAt);
  }

  protected saveReservationAllocation(
    reservationId: string,
    allocation: {
      allocationId: string;
      roomId?: string;
      roomNumber?: string;
      roomTypeId?: string;
      roomType?: string;
      startDate: string;
      endDate: string;
      status: string;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_room_allocations (
            allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(allocation_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            room_type_id = excluded.room_type_id,
            room_type = excluded.room_type,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        allocation.allocationId,
        reservationId,
        allocation.roomId ?? null,
        allocation.roomNumber ?? null,
        allocation.roomTypeId ?? null,
        allocation.roomType ?? null,
        allocation.startDate,
        allocation.endDate,
        allocation.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  protected saveStay(
    reservationId: string,
    stay: {
      stayId: string;
      roomId?: string;
      roomNumber?: string;
      checkedInAt?: string;
      checkedOutAt?: string;
      status: StayStatus;
    },
    timestamp: string,
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO stays (stay_id, reservation_id, room_id, room_number, checked_in_at, checked_out_at, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stay_id) DO UPDATE SET
            reservation_id = excluded.reservation_id,
            room_id = excluded.room_id,
            room_number = excluded.room_number,
            checked_in_at = excluded.checked_in_at,
            checked_out_at = excluded.checked_out_at,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        stay.stayId,
        reservationId,
        stay.roomId ?? null,
        stay.roomNumber ?? null,
        stay.checkedInAt ?? null,
        stay.checkedOutAt ?? null,
        stay.status,
        timestamp,
        timestamp,
      );
    this.inventoryDirty = true;
  }

  protected recordCheckInStayFromConfirm(request: CheckInConfirmApiRequest, result: CoreCheckInConfirmResult): PmsSandboxStayReadback | undefined {
    const reservation = this.resolveStayReservation(request.reservationId, request.reservationCode);
    if (!reservation) {
      return undefined;
    }
    const active = this.findLatestStay({ reservationId: reservation.reservation_id, roomId: result.roomId, status: 'inHouse' });
    if (active) {
      return active;
    }
    const timestamp = nonEmptyString(result.auditEntry.occurredAt, request.requestedAt);
    const stayId = stayIdForCheckIn(reservation.reservation_id, result.roomId, request.idempotencyKey);
    this.saveStay(reservation.reservation_id, {
      stayId,
      roomId: result.roomId,
      roomNumber: result.roomNumber,
      checkedInAt: timestamp,
      status: 'inHouse',
    }, timestamp);
    return this.findLatestStay({ reservationId: reservation.reservation_id, roomId: result.roomId, status: 'inHouse' });
  }

  protected recordCheckOutStayFromConfirm(request: CheckOutConfirmApiRequest, result: CoreCheckOutConfirmResult): PmsSandboxStayReadback | undefined {
    const hasReservationIdentity = Boolean(optionalString(request.reservationId) || optionalString(request.reservationCode));
    const reservation = this.resolveStayReservation(request.reservationId, request.reservationCode);
    if (hasReservationIdentity && !reservation) {
      return undefined;
    }
    const active = this.findLatestStay({ reservationId: reservation?.reservation_id, roomId: result.roomId, status: 'inHouse' });
    if (!active) {
      return this.findLatestStay({ reservationId: reservation?.reservation_id, roomId: result.roomId, status: 'checkedOut' });
    }
    const timestamp = nonEmptyString(result.auditEntry.occurredAt, request.requestedAt);
    this.saveStay(active.reservationId, {
      stayId: active.stayId,
      roomId: active.roomId ?? result.roomId,
      roomNumber: active.roomNumber ?? result.roomNumber,
      checkedInAt: active.checkedInAt,
      checkedOutAt: timestamp,
      status: 'checkedOut',
    }, timestamp);
    return this.findLatestStay({ reservationId: active.reservationId, roomId: result.roomId, status: 'checkedOut' });
  }

  protected resolveStayReservation(reservationId?: string, reservationCode?: string): ReservationRow | undefined {
    const normalizedId = optionalString(reservationId);
    if (normalizedId) {
      const byId = this.getReservationRowById(normalizedId);
      if (byId) return byId;
    }
    const normalizedCode = optionalString(reservationCode);
    return normalizedCode ? this.getReservationRowByCode(normalizedCode) : undefined;
  }

  protected getReservationRowById(reservationId: string): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_id = ?
        `,
      )
      .get(reservationId) as ReservationRow | undefined;
  }

  protected getReservationRowByCode(reservationCode: string): ReservationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT r.*, g.display_name
          FROM reservations r
          INNER JOIN guests g ON g.guest_id = r.guest_id
          WHERE r.reservation_code = ?
        `,
      )
      .get(reservationCode) as ReservationRow | undefined;
  }

  protected findLatestStay(filter: { readonly reservationId?: string; readonly roomId?: string; readonly status: StayStatus }): PmsSandboxStayReadback | undefined {
    return this.listStays()
      .filter((stay) => stay.status === filter.status)
      .filter((stay) => !filter.reservationId || stay.reservationId === filter.reservationId)
      .filter((stay) => !filter.roomId || stay.roomId === filter.roomId)
      .at(-1);
  }

  protected getLatestReservationAllocation(reservationId: string): PmsSandboxReservationAllocationReadback | undefined {
    const rows = this.db
      .prepare(
        `
          SELECT allocation_id, reservation_id, room_id, room_number, room_type_id, room_type, start_date, end_date, status
          FROM reservation_room_allocations
          WHERE reservation_id = ?
          ORDER BY updated_at DESC, allocation_id DESC
        `,
      )
      .all(reservationId) as Array<{
        allocation_id: string;
        reservation_id: string;
        room_id?: string | null;
        room_number?: string | null;
        room_type_id?: string | null;
        room_type?: string | null;
        start_date: string;
        end_date: string;
        status: string;
      }>;
    const row = rows[0];
    return row
      ? {
          allocationId: row.allocation_id,
          reservationId: row.reservation_id,
          ...(row.room_id ? { roomId: row.room_id } : {}),
          ...(row.room_number ? { roomNumber: row.room_number } : {}),
          ...(row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
          ...(row.room_type ? { roomType: row.room_type } : {}),
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.status,
        }
      : undefined;
  }

  protected getLatestStay(reservationId: string): PmsSandboxStayReadback | undefined {
    const row = this.db
      .prepare(
        `
          SELECT s.stay_id, s.reservation_id, r.reservation_code, s.room_id, s.room_number, s.checked_in_at, s.checked_out_at, s.status
          FROM stays s
          INNER JOIN reservations r ON r.reservation_id = s.reservation_id
          WHERE s.reservation_id = ?
          ORDER BY s.updated_at DESC, s.stay_id DESC
        `,
      )
      .get(reservationId) as StayRow | undefined;
    return row ? stayFromRow(row) : undefined;
  }

  protected reservationReadModelFromRow(row: ReservationRow, generatedAt: string): ReservationReadModel {
    const allocation = this.getLatestReservationAllocation(row.reservation_id);
    const stay = this.getLatestStay(row.reservation_id);
    return {
      reservationId: row.reservation_id,
      reservationCode: row.reservation_code,
      propertyId: row.property_id,
      ...(stay?.roomId ? { roomId: stay.roomId } : allocation?.roomId ? { roomId: allocation.roomId } : row.room_id ? { roomId: row.room_id } : {}),
      ...(stay?.roomNumber ? { roomNumber: stay.roomNumber } : allocation?.roomNumber ? { roomNumber: allocation.roomNumber } : row.room_number ? { roomNumber: row.room_number } : {}),
      ...(allocation?.roomTypeId ? { roomTypeId: allocation.roomTypeId } : row.room_type_id ? { roomTypeId: row.room_type_id } : {}),
      ...(allocation?.roomType ? { roomType: allocation.roomType } : row.room_type ? { roomType: row.room_type } : {}),
      guestDisplayName: row.display_name,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: stay?.status === 'inHouse'
        ? 'checkedIn'
        : stay?.status === 'checkedOut'
          ? 'checkedOut'
          : row.status,
      projectionFreshness: createProjectionFreshness(generatedAt, 'fresh'),
    };
  }
}

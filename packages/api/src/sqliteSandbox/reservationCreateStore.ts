import type {
  ReservationGroupRoomSelection,
} from '@pms-platform/contracts';
import { type RoomAggregate } from '@pms-platform/core';
import {
  pmsReservationCreateOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareBookingOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareBookingOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type ApiErrorCode,
  type ReservationCreateApiRequest,
  type ReservationCreateApiResponse,
  type ReservationDraftWorkflowApiResponse,
  type ReservationGroupDraftWorkflowApiResponse,
  type ReservationGroupPrepareBookingApiRequest,
  type ReservationPrepareBookingApiRequest,
} from '../index.js';
import {
  cloneValue,
  nonEmptyString,
  optionalString,
  reservationCreateCodeFromClientToken,
  reservationCreateIdFromClientToken,
  stableRefHash,
} from './model.js';
import { SqliteSandboxReservationAdjustStore } from './reservationAdjustStore.js';

export abstract class SqliteSandboxReservationCreateStore extends SqliteSandboxReservationAdjustStore {
  createReservation(request: ReservationCreateApiRequest): ReservationCreateApiResponse {
    return this.runInTransaction(() => this.createReservationRecord(request));
  }

  prepareReservationBooking(
    request: ReservationPrepareBookingApiRequest,
  ): ReservationCreateApiResponse {
    return this.runInTransaction(() =>
      this.prepareReservationBookingRecord(request),
    );
  }

  prepareReservationGroupBooking(
    request: ReservationGroupPrepareBookingApiRequest,
  ): ReservationCreateApiResponse {
    return this.runInTransaction(() =>
      this.prepareReservationGroupBookingRecord(request),
    );
  }

  protected createReservationRecord(
    request: ReservationCreateApiRequest,
  ): ReservationCreateApiResponse {
    const replay = this.reservationCreateReplayOrConflict(request);
    if (replay) return replay;

    const normalized = normalizeCreateSlots(request);
    if (!normalized.ok) return normalized.response;

    const room = this.getRoom(request.roomId);
    if (!room || !matchesProperty(room, request.propertyId)) {
      return reservationCreateRejectedResponse(
        request,
        'rejected',
        'RESERVATION_CREATE_ROOM_NOT_FOUND',
        'Room was not found for the requested property.',
        'roomId',
      );
    }
    if (!this.roomIsAvailable(room, normalized.arrivalDate, normalized.departureDate)) {
      return reservationCreateRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ROOM_UNAVAILABLE',
        'Room is not available for the requested stay range.',
        'roomId',
      );
    }

    const reservationId = reservationCreateIdFromClientToken(request.clientToken);
    const reservation = this.saveReservationImportRecord({
      reservationId,
      reservationCode: reservationCreateCodeFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, room.propertyId ?? 'property-small-hotel'),
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      roomTypeId: room.roomTypeId,
      roomType: room.roomType,
      guestDisplayName: normalized.guestDisplayName,
      arrivalDate: normalized.arrivalDate,
      departureDate: normalized.departureDate,
      status: 'booked',
      allocation: {
        allocationId: `alloc-${reservationId}`,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        roomTypeId: room.roomTypeId,
        roomType: room.roomType,
        startDate: normalized.arrivalDate,
        endDate: normalized.departureDate,
        status: 'allocated',
      },
    });

    const response: ReservationCreateApiResponse = {
      ok: true,
      operation: pmsReservationCreateOperation,
      status: 'ok',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      reservation,
    };
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  protected prepareReservationBookingRecord(
    request: ReservationPrepareBookingApiRequest,
  ): ReservationCreateApiResponse {
    const replay = this.reservationCreateReplayOrConflict(request);
    if (replay) return replay;

    const normalized = normalizeCreateSlots(request);
    if (!normalized.ok) return normalized.response;

    const roomResult = this.resolveBookingRoom(request, normalized);
    if (!roomResult.ok) return roomResult.response;
    const room = roomResult.room;

    const draft = this.createPreparedReservationDraft(
      request,
      normalized,
      room,
    );
    if (!draft.ok) return mapWorkflowFailure(request, draft);

    const response: ReservationCreateApiResponse = {
      ok: true,
      operation: pmsReservationPrepareBookingOperation,
      status: 'ok',
      mutationStatus: 'none',
      idempotencyStatus: 'prepared',
      draft: draft.draft,
    };
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  protected prepareReservationGroupBookingRecord(
    request: ReservationGroupPrepareBookingApiRequest,
  ): ReservationCreateApiResponse {
    const replay = this.reservationCreateReplayOrConflict(request);
    if (replay) return replay;

    const normalized = normalizeCreateSlots(request);
    if (!normalized.ok) return normalized.response;
    if (!Number.isInteger(request.quantity) || request.quantity < 1) {
      return reservationCreateRejectedResponse(
        request,
        'rejected',
        'RESERVATION_CREATE_MISSING_REQUIRED_SLOTS',
        'Group booking requires a positive quantity.',
        'quantity',
      );
    }

    const rooms = this.selectAvailableRooms({
      propertyId: request.propertyId,
      roomTypeKeyword: request.roomTypeKeyword,
      arrivalDate: normalized.arrivalDate,
      departureDate: normalized.departureDate,
      quantity: request.quantity,
    });
    if (rooms.length < request.quantity) {
      return reservationCreateRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ROOM_UNAVAILABLE',
        'Not enough rooms are available for the requested group booking.',
        'quantity',
      );
    }

    const groupDraft = this.createPreparedReservationGroupDraft(
      request,
      normalized,
      rooms,
    );
    if (!groupDraft.ok) return mapWorkflowFailure(request, groupDraft);

    const response: ReservationCreateApiResponse = {
      ok: true,
      operation: pmsReservationGroupPrepareBookingOperation,
      status: 'ok',
      mutationStatus: 'none',
      idempotencyStatus: 'prepared',
      groupDraft: groupDraft.groupDraft,
    };
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  private createPreparedReservationDraft(
    request: ReservationPrepareBookingApiRequest,
    normalized: NormalizedReservationCreateSlots,
    room: RoomAggregate,
  ): ReservationDraftWorkflowApiResponse {
    const draftResponse = this.createReservationDraftRecord({
      operation: pmsReservationDraftCreateOperation,
      propertyId: nonEmptyString(request.propertyId, room.propertyId ?? 'property-small-hotel'),
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'draft'),
      requestFingerprint: nestedFingerprint(request, 'draft'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      slots: {
        guestDisplayName: normalized.guestDisplayName,
        arrivalDate: normalized.arrivalDate,
        departureDate: normalized.departureDate,
        roomId: room.roomId,
        selectedCandidateRef: selectedCandidateRef(request.clientToken, room.roomId),
        ...(room.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
        ...(room.roomType ? { roomTypeKeyword: room.roomType } : {}),
        ...(request.reason ? { note: request.reason } : {}),
      },
      evidenceRefs: [
        {
          source: 'platformReadModel',
          refId: `native-prepare:${request.clientToken}:${room.roomId}`,
          generatedAt: request.requestedAt,
        },
      ],
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    });
    if (!draftResponse.ok) return draftResponse;

    const quoteResponse = this.quoteReservationDraftRecord({
      operation: pmsReservationQuoteOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'quote'),
      requestFingerprint: nestedFingerprint(request, 'quote'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      draftRef: draftResponse.draft.draftRef,
      draftId: draftResponse.draft.draftId,
    });
    if (!quoteResponse.ok) return quoteResponse;

    return this.prepareConfirmReservationDraftRecord({
      operation: pmsReservationPrepareConfirmOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'prepare'),
      requestFingerprint: nestedFingerprint(request, 'prepare'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      draftRef: quoteResponse.draft.draftRef,
      draftId: quoteResponse.draft.draftId,
      quoteRef: quoteResponse.draft.quote?.quoteRef,
    });
  }

  private createPreparedReservationGroupDraft(
    request: ReservationGroupPrepareBookingApiRequest,
    normalized: NormalizedReservationCreateSlots,
    rooms: readonly RoomAggregate[],
  ): ReservationGroupDraftWorkflowApiResponse {
    const createResponse = this.createReservationGroupDraftRecord({
      operation: pmsReservationGroupDraftCreateOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'group-draft'),
      requestFingerprint: nestedFingerprint(request, 'group-draft'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      slots: {
        guestDisplayName: normalized.guestDisplayName,
        arrivalDate: normalized.arrivalDate,
        departureDate: normalized.departureDate,
        quantity: request.quantity,
        roomTypeKeyword: request.roomTypeKeyword,
        ...(request.reason ? { note: request.reason } : {}),
      },
      evidenceRefs: [
        {
          source: 'platformReadModel',
          refId: `native-group-prepare:${request.clientToken}`,
          generatedAt: request.requestedAt,
        },
      ],
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    });
    if (!createResponse.ok) return createResponse;

    const selections = rooms.map((room): ReservationGroupRoomSelection => ({
      roomId: room.roomId,
      selectedCandidateRef: selectedCandidateRef(request.clientToken, room.roomId),
      ...(room.roomTypeId ? { roomTypeId: room.roomTypeId } : {}),
      ...(room.roomType ? { roomType: room.roomType } : {}),
    }));
    const updateResponse = this.updateReservationGroupDraftRecord({
      operation: pmsReservationGroupDraftUpdateOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'group-select'),
      requestFingerprint: nestedFingerprint(request, 'group-select'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      groupDraftRef: createResponse.groupDraft.groupDraftRef,
      groupDraftId: createResponse.groupDraft.groupDraftId,
      slots: { selections },
      missingSlots: [],
    });
    if (!updateResponse.ok) return updateResponse;

    const quoteResponse = this.quoteReservationGroupDraftRecord({
      operation: pmsReservationGroupQuoteOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'group-quote'),
      requestFingerprint: nestedFingerprint(request, 'group-quote'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      groupDraftRef: updateResponse.groupDraft.groupDraftRef,
      groupDraftId: updateResponse.groupDraft.groupDraftId,
    });
    if (!quoteResponse.ok) return quoteResponse;

    return this.prepareConfirmReservationGroupDraftRecord({
      operation: pmsReservationGroupPrepareConfirmOperation,
      propertyId: request.propertyId,
      actor: request.actor,
      source: request.source,
      clientToken: nestedToken(request, 'group-prepare'),
      requestFingerprint: nestedFingerprint(request, 'group-prepare'),
      correlationId: request.correlationId,
      requestedAt: request.requestedAt,
      groupDraftRef: quoteResponse.groupDraft.groupDraftRef,
      groupDraftId: quoteResponse.groupDraft.groupDraftId,
      quoteRef: quoteResponse.groupDraft.quote?.quoteRef,
    });
  }

  private resolveBookingRoom(
    request: ReservationPrepareBookingApiRequest,
    normalized: NormalizedReservationCreateSlots,
  ): { ok: true; room: RoomAggregate } | { ok: false; response: ReservationCreateApiResponse } {
    const roomId = optionalString(request.roomId);
    const roomNumber = optionalString(request.roomNumber);
    const roomTypeKeyword = optionalString(request.roomTypeKeyword);
    const room = roomId
      ? this.getRoom(roomId)
      : roomNumber
        ? this.getRoomByNumber(roomNumber, request.propertyId)
        : undefined;

    if (roomId || roomNumber) {
      if (!room || !matchesProperty(room, request.propertyId)) {
        return {
          ok: false,
          response: reservationCreateRejectedResponse(
            request,
            'rejected',
            'RESERVATION_CREATE_ROOM_NOT_FOUND',
            'Requested room was not found.',
            roomId ? 'roomId' : 'roomNumber',
          ),
        };
      }
      if (!this.roomIsAvailable(room, normalized.arrivalDate, normalized.departureDate)) {
        return {
          ok: false,
          response: reservationCreateRejectedResponse(
            request,
            'rejected',
            'RESERVATION_ROOM_UNAVAILABLE',
            'Requested room is not available for the stay range.',
            roomId ? 'roomId' : 'roomNumber',
          ),
        };
      }
      return { ok: true, room };
    }

    if (!roomTypeKeyword) {
      return {
        ok: false,
        response: reservationCreateRejectedResponse(
          request,
          'rejected',
          'RESERVATION_CREATE_ROOM_SELECTION_REQUIRED',
          'Reservation prepare booking requires a room, room number, or room type.',
          'roomTypeKeyword',
        ),
      };
    }

    const [selected] = this.selectAvailableRooms({
      propertyId: request.propertyId,
      roomTypeKeyword,
      arrivalDate: normalized.arrivalDate,
      departureDate: normalized.departureDate,
      quantity: 1,
    });
    if (!selected) {
      return {
        ok: false,
        response: reservationCreateRejectedResponse(
          request,
          'rejected',
          'RESERVATION_ROOM_UNAVAILABLE',
          'No room is available for the requested stay range.',
          'roomTypeKeyword',
        ),
      };
    }
    return { ok: true, room: selected };
  }

  private selectAvailableRooms(options: {
    readonly propertyId: string;
    readonly roomTypeKeyword: string;
    readonly arrivalDate: string;
    readonly departureDate: string;
    readonly quantity: number;
  }): readonly RoomAggregate[] {
    const dates = businessDates(options.arrivalDate, options.departureDate);
    const horizon = this.rebuildInventoryHorizon({
      startDate: options.arrivalDate,
      horizonDays: dates.length,
    });
    const availableRoomIds = new Set(
      this.listRooms()
        .filter((room) => matchesProperty(room, options.propertyId))
        .filter((room) => matchesRoomTypeKeyword(room, options.roomTypeKeyword))
        .filter((room) =>
          dates.every((date) =>
            horizon.dayRooms.some(
              (dayRoom) =>
                dayRoom.roomId === room.roomId &&
                dayRoom.businessDate === date &&
                dayRoom.availabilityStatus === 'available',
            ),
          ),
        )
        .sort(compareRooms)
        .slice(0, options.quantity)
        .map((room) => room.roomId),
    );
    return this.listRooms()
      .filter((room) => availableRoomIds.has(room.roomId))
      .sort(compareRooms);
  }

  private roomIsAvailable(
    room: RoomAggregate,
    arrivalDate: string,
    departureDate: string,
  ): boolean {
    const dates = businessDates(arrivalDate, departureDate);
    if (dates.length === 0) return false;
    const horizon = this.rebuildInventoryHorizon({
      startDate: arrivalDate,
      horizonDays: dates.length,
      roomId: room.roomId,
    });
    return dates.every((date) =>
      horizon.dayRooms.some(
        (dayRoom) =>
          dayRoom.roomId === room.roomId &&
          dayRoom.businessDate === date &&
          dayRoom.availabilityStatus === 'available',
      ),
    );
  }

  private reservationCreateReplayOrConflict(
    request:
      | ReservationCreateApiRequest
      | ReservationPrepareBookingApiRequest
      | ReservationGroupPrepareBookingApiRequest,
  ): ReservationCreateApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (
      existing.requestFingerprint !== request.requestFingerprint ||
      !('operation' in existing.response) ||
      existing.response.operation !== request.operation
    ) {
      return reservationCreateRejectedResponse(
        request,
        'rejected',
        'RESERVATION_CREATE_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        'The reservation create client token was reused with a different request fingerprint.',
        'requestFingerprint',
      );
    }
    const response = cloneValue(existing.response) as ReservationCreateApiResponse;
    return response.ok ? { ...response, idempotencyStatus: 'replayed' } : response;
  }
}

interface NormalizedReservationCreateSlots {
  readonly guestDisplayName: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
}

function normalizeCreateSlots(
  request:
    | ReservationCreateApiRequest
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
):
  | { ok: true; guestDisplayName: string; arrivalDate: string; departureDate: string }
  | { ok: false; response: ReservationCreateApiResponse } {
  const guestDisplayName = optionalString(request.guestDisplayName);
  if (!guestDisplayName) {
    return missingRequiredSlot(request, 'guestDisplayName');
  }
  const arrivalDate = optionalString(request.arrivalDate);
  if (!arrivalDate || !isBusinessDate(arrivalDate)) {
    return missingRequiredSlot(request, 'arrivalDate');
  }
  const departureDate = optionalString(request.departureDate);
  if (!departureDate || !isBusinessDate(departureDate) || departureDate <= arrivalDate) {
    return missingRequiredSlot(request, 'departureDate');
  }
  return { ok: true, guestDisplayName, arrivalDate, departureDate };
}

function missingRequiredSlot(
  request:
    | ReservationCreateApiRequest
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
  field: string,
): { ok: false; response: ReservationCreateApiResponse } {
  return {
    ok: false,
    response: reservationCreateRejectedResponse(
      request,
      'rejected',
      'RESERVATION_CREATE_MISSING_REQUIRED_SLOTS',
      'Reservation create workflow is missing required slots.',
      field,
    ),
  };
}

function mapWorkflowFailure(
  request:
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
  response:
    | ReservationDraftWorkflowApiResponse
    | ReservationGroupDraftWorkflowApiResponse,
): ReservationCreateApiResponse {
  const error = response.ok ? undefined : response.errors[0];
  return reservationCreateRejectedResponse(
    request,
    response.ok ? 'rejected' : response.status === 'notFound' ? 'notFound' : 'rejected',
    error?.code ?? 'RESERVATION_CREATE_WORKFLOW_NOT_IMPLEMENTED',
    error?.message ?? 'Reservation create workflow failed.',
    error?.field ?? 'operation',
  );
}

function reservationCreateRejectedResponse(
  request:
    | ReservationCreateApiRequest
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
  status: 'rejected' | 'notFound',
  code: ApiErrorCode,
  message: string,
  field: string,
): ReservationCreateApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status,
    mutationStatus: 'none',
    errors: [{ code, message, field }],
  };
}

function nestedToken(
  request:
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
  step: string,
): string {
  return `${request.clientToken}:${step}`;
}

function nestedFingerprint(
  request:
    | ReservationPrepareBookingApiRequest
    | ReservationGroupPrepareBookingApiRequest,
  step: string,
): string {
  return stableRefHash(`${request.operation}:${request.requestFingerprint}:${step}`);
}

function selectedCandidateRef(clientToken: string, roomId: string): string {
  return stableRefHash(`native-reservation-create:${clientToken}:${roomId}`);
}

function matchesProperty(room: RoomAggregate, propertyId: string): boolean {
  return !room.propertyId || !propertyId || room.propertyId === propertyId;
}

function matchesRoomTypeKeyword(room: RoomAggregate, keyword: string): boolean {
  const needle = keyword.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [room.roomTypeId, room.roomType, room.roomNumber]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

function compareRooms(left: RoomAggregate, right: RoomAggregate): number {
  return (left.sortKey ?? left.roomNumber).localeCompare(
    right.sortKey ?? right.roomNumber,
  );
}

function businessDates(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  for (let cursor = startDate; cursor < endDate; cursor = addBusinessDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > 365) break;
  }
  return dates;
}

function addBusinessDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

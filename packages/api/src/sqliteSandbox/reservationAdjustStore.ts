import type { ReservationReadModel } from '@pms-platform/contracts';
import {
  pmsReservationAdjustOperation,
  type ApiErrorCode,
  type ReservationAdjustApiRequest,
  type ReservationAdjustApiResponse,
} from '../index.js';
import {
  dateRangesOverlap,
  nonEmptyString,
  optionalString,
  reservationAdjustCodeFromClientToken,
  reservationAdjustIdFromClientToken,
} from './model.js';
import { SqliteSandboxReservationCancelActionStore } from './reservationCancelActionStore.js';

export abstract class SqliteSandboxReservationAdjustStore extends SqliteSandboxReservationCancelActionStore {
  adjustReservation(request: ReservationAdjustApiRequest): ReservationAdjustApiResponse {
    return this.runInTransaction(() => this.adjustReservationRecord(request));
  }

  protected adjustReservationRecord(
    request: ReservationAdjustApiRequest,
  ): ReservationAdjustApiResponse {
    const replay = this.reservationAdjustReplayOrConflict(request);
    if (replay) return replay;

    const requestedAt = nonEmptyString(request.requestedAt, this.now());
    const row = this.resolveStayReservation(
      request.reservationId,
      request.reservationCode,
    );
    if (!row) {
      return adjustRejectedResponse(
        request,
        'notFound',
        'RESERVATION_ADJUST_NOT_FOUND',
        'Reservation was not found.',
        request.reservationId ? 'reservationId' : 'reservationCode',
      );
    }

    const originalReservation = this.reservationReadModelFromRow(row, requestedAt);
    if (originalReservation.status !== 'booked') {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ADJUST_NOT_ACTIVE',
        'Only booked reservations can be adjusted through this workflow.',
        'status',
        originalReservation,
      );
    }

    const targetRoomId = optionalString(request.targetRoomId) ?? originalReservation.roomId;
    if (!targetRoomId) {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ADJUST_MISSING_ROOM',
        'Reservation adjustment requires a target room.',
        'targetRoomId',
        originalReservation,
      );
    }
    const targetRoom = this.getRoom(targetRoomId);
    if (!targetRoom) {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ADJUST_ROOM_NOT_FOUND',
        'Target room was not found.',
        'targetRoomId',
        originalReservation,
      );
    }

    const arrivalDate = optionalString(request.arrivalDate) ?? originalReservation.arrivalDate;
    const departureDate = optionalString(request.departureDate) ?? originalReservation.departureDate;
    if (departureDate <= arrivalDate) {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ROOM_UNAVAILABLE',
        'Adjusted departure date must be after arrival date.',
        'departureDate',
        originalReservation,
      );
    }

    const conflictingReservation = this.listReservationsByRoomIds(
      new Set([targetRoomId]),
    ).find(
      (reservation) =>
        reservation.reservationId !== row.reservation_id &&
        reservation.status !== 'cancelled' &&
        reservation.status !== 'checkedOut' &&
        dateRangesOverlap(
          arrivalDate,
          departureDate,
          reservation.arrivalDate,
          reservation.departureDate,
        ),
    );
    if (conflictingReservation) {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ROOM_UNAVAILABLE',
        'Target room is not available for the adjusted stay range.',
        'targetRoomId',
        originalReservation,
      );
    }

    this.cancelReservationRecord(row.reservation_id, requestedAt);
    const replacementReservationId = reservationAdjustIdFromClientToken(
      request.clientToken,
    );
    const reservation = this.saveReservationImportRecord({
      reservationId: replacementReservationId,
      reservationCode: reservationAdjustCodeFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, row.property_id),
      roomId: targetRoom.roomId,
      roomNumber: targetRoom.roomNumber,
      roomTypeId: targetRoom.roomTypeId,
      roomType: targetRoom.roomType,
      guestDisplayName:
        optionalString(request.guestDisplayName) ?? row.display_name,
      arrivalDate,
      departureDate,
      status: 'booked',
      allocation: {
        allocationId: `alloc-${replacementReservationId}`,
        roomId: targetRoom.roomId,
        roomNumber: targetRoom.roomNumber,
        roomTypeId: targetRoom.roomTypeId,
        roomType: targetRoom.roomType,
        startDate: arrivalDate,
        endDate: departureDate,
        status: 'allocated',
      },
    });

    const response: ReservationAdjustApiResponse = {
      ok: true,
      operation: pmsReservationAdjustOperation,
      status: 'ok',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      originalReservation,
      reservation,
    };
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  protected reservationAdjustReplayOrConflict(
    request: ReservationAdjustApiRequest,
  ): ReservationAdjustApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (
      existing.requestFingerprint !== request.requestFingerprint ||
      !('operation' in existing.response) ||
      existing.response.operation !== request.operation
    ) {
      return adjustRejectedResponse(
        request,
        'rejected',
        'RESERVATION_ADJUST_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        'The reservation adjust client token was reused with a different request fingerprint.',
        'requestFingerprint',
      );
    }
    return {
      ...(existing.response as ReservationAdjustApiResponse),
      idempotencyStatus: 'replayed',
    } as ReservationAdjustApiResponse;
  }
}

function adjustRejectedResponse(
  request: ReservationAdjustApiRequest,
  status: 'rejected' | 'notFound',
  code: ApiErrorCode,
  message: string,
  field: string,
  originalReservation?: ReservationReadModel,
): ReservationAdjustApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status,
    mutationStatus: 'none',
    ...(originalReservation ? { originalReservation } : {}),
    errors: [{ code, message, field }],
  };
}

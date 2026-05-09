import { type ReservationReadModel } from '@pms-platform/contracts';
import {
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
} from '../index.js';
import {
  StoredReservationDraft,
  StoredReservationGroupDraft,
  addBusinessDays,
  dateRangesOverlap,
  pendingActionRejectedResponse,
  pendingActionRejectedResponseFromGroup,
  reservationCodeFromDraft,
  reservationCodeFromGroupDraftSelection,
  reservationIdFromDraft,
  reservationIdFromGroupDraftSelection,
} from './model.js';
import { SqliteSandboxReservationGroupDraftStore } from './reservationGroupDraftStore.js';

export abstract class SqliteSandboxReservationMaterializationStore extends SqliteSandboxReservationGroupDraftStore {
  protected reservationDraftMaterializationRejection(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
  ): PendingActionCallbackApiResponse | undefined {
    const slots = draft.slots;
    if (
      !slots.guestDisplayName ||
      !slots.arrivalDate ||
      !slots.departureDate ||
      !slots.roomId
    ) {
      return pendingActionRejectedResponse(
        request,
        draft,
        'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS',
        'Reservation draft is missing slots required to create a final reservation.',
        'slots',
      );
    }
    const reservationId = reservationIdFromDraft(draft);
    const conflictingReservation = this.listReservationsByRoomIds(
      new Set([slots.roomId]),
    ).find(
      (reservation) =>
        reservation.reservationId !== reservationId &&
        reservation.status !== 'cancelled' &&
        reservation.status !== 'checkedOut' &&
        dateRangesOverlap(
          slots.arrivalDate!,
          slots.departureDate!,
          reservation.arrivalDate,
          reservation.departureDate,
        ),
    );
    if (conflictingReservation) {
      return pendingActionRejectedResponse(
        request,
        draft,
        'RESERVATION_ROOM_UNAVAILABLE',
        'Selected room is no longer available for this stay range.',
        'roomId',
      );
    }
    return undefined;
  }

  protected reservationGroupDraftMaterializationRejection(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationGroupDraft,
  ): PendingActionCallbackApiResponse | undefined {
    const slots = draft.slots;
    const selections = slots.selections ?? [];
    if (
      !slots.guestDisplayName ||
      !slots.arrivalDate ||
      !slots.departureDate ||
      !slots.quantity ||
      selections.length !== slots.quantity ||
      selections.some(
        (selection) => !selection.roomId || !selection.selectedCandidateRef,
      )
    ) {
      return pendingActionRejectedResponseFromGroup(
        request,
        draft,
        'RESERVATION_GROUP_DRAFT_MISSING_REQUIRED_SLOTS',
        'Reservation group draft is missing room selections required to create final reservations.',
        'roomSelections',
      );
    }

    const roomIds = selections.map((selection) => selection.roomId);
    if (
      new Set(roomIds).size !== roomIds.length ||
      roomIds.some((roomId) => !this.getRoom(roomId))
    ) {
      return pendingActionRejectedResponseFromGroup(
        request,
        draft,
        'RESERVATION_ROOM_UNAVAILABLE',
        'One or more selected rooms are no longer available for this stay range.',
        'roomSelections',
      );
    }

    const materializedReservationIds = new Set(
      selections.map((_selection, index) =>
        reservationIdFromGroupDraftSelection(draft, index),
      ),
    );
    const conflictingReservation = this.listReservationsByRoomIds(
      new Set(roomIds),
    ).find(
      (reservation) =>
        !materializedReservationIds.has(reservation.reservationId) &&
        reservation.status !== 'cancelled' &&
        reservation.status !== 'checkedOut' &&
        dateRangesOverlap(
          slots.arrivalDate!,
          slots.departureDate!,
          reservation.arrivalDate,
          reservation.departureDate,
        ),
    );
    if (conflictingReservation) {
      return pendingActionRejectedResponseFromGroup(
        request,
        draft,
        'RESERVATION_ROOM_UNAVAILABLE',
        'One or more selected rooms are no longer available for this stay range.',
        'roomSelections',
      );
    }
    return undefined;
  }

  protected materializeConfirmedReservationDraft(
    draft: StoredReservationDraft,
    requestedAt: string,
  ): ReservationReadModel {
    const slots = draft.slots;
    const room = slots.roomId ? this.getRoom(slots.roomId) : undefined;
    const startDate = slots.arrivalDate ?? requestedAt.slice(0, 10);
    const endDate = slots.departureDate ?? addBusinessDays(startDate, 1);
    const reservationId = reservationIdFromDraft(draft);
    return this.saveReservationImportRecord({
      reservationId,
      reservationCode: reservationCodeFromDraft(draft),
      propertyId: draft.propertyId,
      roomId: slots.roomId,
      roomNumber: room?.roomNumber,
      roomTypeId: slots.roomTypeId ?? room?.roomTypeId,
      roomType: room?.roomType,
      guestDisplayName: slots.guestDisplayName ?? 'Guest',
      arrivalDate: startDate,
      departureDate: endDate,
      status: 'booked',
      allocation: {
        allocationId: `alloc-${reservationId}`,
        roomId: slots.roomId,
        roomNumber: room?.roomNumber,
        roomTypeId: slots.roomTypeId ?? room?.roomTypeId,
        roomType: room?.roomType,
        startDate,
        endDate,
        status: 'allocated',
      },
    });
  }

  protected materializeConfirmedReservationGroupDraft(
    draft: StoredReservationGroupDraft,
    requestedAt: string,
  ): ReservationReadModel[] {
    const slots = draft.slots;
    const startDate = slots.arrivalDate ?? requestedAt.slice(0, 10);
    const endDate = slots.departureDate ?? addBusinessDays(startDate, 1);
    return (slots.selections ?? []).map((selection, index) => {
      const room = this.getRoom(selection.roomId);
      const reservationId = reservationIdFromGroupDraftSelection(draft, index);
      return this.saveReservationImportRecord({
        reservationId,
        reservationCode: reservationCodeFromGroupDraftSelection(draft, index),
        propertyId: draft.propertyId,
        roomId: selection.roomId,
        roomNumber: room?.roomNumber,
        roomTypeId: selection.roomTypeId ?? room?.roomTypeId,
        roomType: selection.roomType ?? room?.roomType,
        guestDisplayName: slots.guestDisplayName ?? 'Guest',
        arrivalDate: startDate,
        departureDate: endDate,
        status: 'booked',
        allocation: {
          allocationId: `alloc-${reservationId}`,
          roomId: selection.roomId,
          roomNumber: room?.roomNumber,
          roomTypeId: selection.roomTypeId ?? room?.roomTypeId,
          roomType: selection.roomType ?? room?.roomType,
          startDate,
          endDate,
          status: 'allocated',
        },
      });
    });
  }
}

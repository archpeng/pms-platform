import {
type ReservationReadModel
} from '@pms-platform/contracts';
import {
type PendingActionCallbackApiRequest,
type PendingActionCallbackApiResponse
} from '../index.js';
import {
StoredReservationDraft,
addBusinessDays,
dateRangesOverlap,
pendingActionRejectedResponse,
reservationCodeFromDraft,
reservationIdFromDraft
} from './model.js';
import { SqliteSandboxReservationGroupDraftStore } from './reservationGroupDraftStore.js';

export abstract class SqliteSandboxReservationMaterializationStore extends SqliteSandboxReservationGroupDraftStore {
  protected reservationDraftMaterializationRejection(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
  ): PendingActionCallbackApiResponse | undefined {
    const slots = draft.slots;
    if (!slots.guestDisplayName || !slots.arrivalDate || !slots.departureDate || !slots.roomId) {
      return pendingActionRejectedResponse(request, draft, 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS', 'Reservation draft is missing slots required to create a final reservation.', 'slots');
    }
    const reservationId = reservationIdFromDraft(draft);
    const conflictingReservation = this.listReservationsByRoomIds(new Set([slots.roomId]))
      .find((reservation) =>
        reservation.reservationId !== reservationId &&
        reservation.status !== 'cancelled' &&
        reservation.status !== 'checkedOut' &&
        dateRangesOverlap(slots.arrivalDate!, slots.departureDate!, reservation.arrivalDate, reservation.departureDate)
      );
    if (conflictingReservation) {
      return pendingActionRejectedResponse(request, draft, 'RESERVATION_ROOM_UNAVAILABLE', 'Selected room is no longer available for this stay range.', 'roomId');
    }
    return undefined;
  }

  protected materializeConfirmedReservationDraft(draft: StoredReservationDraft, requestedAt: string): ReservationReadModel {
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
}

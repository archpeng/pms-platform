import {
  type CoreCheckInConfirmResult,
  type CoreCheckOutConfirmResult,
} from '@pms-platform/core';
import {
  type CheckInConfirmApiRequest,
  type CheckOutConfirmApiRequest,
} from '../index.js';
import { type PmsSandboxStayReadback } from '../localSandbox/model.js';
import { nonEmptyString, optionalString, stayIdForCheckIn } from './model.js';
import { SqliteSandboxReservationImportStore } from './reservationImportStore.js';

export abstract class SqliteSandboxReservationStayLifecycleStore extends SqliteSandboxReservationImportStore {
  recordCheckInStay(
    request: CheckInConfirmApiRequest,
    result: CoreCheckInConfirmResult,
  ): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() =>
      this.recordCheckInStayFromConfirm(request, result),
    );
  }

  recordCheckOutStay(
    request: CheckOutConfirmApiRequest,
    result: CoreCheckOutConfirmResult,
  ): PmsSandboxStayReadback | undefined {
    return this.runInTransaction(() =>
      this.recordCheckOutStayFromConfirm(request, result),
    );
  }

  protected recordCheckInStayFromConfirm(
    request: CheckInConfirmApiRequest,
    result: CoreCheckInConfirmResult,
  ): PmsSandboxStayReadback | undefined {
    const reservation = this.resolveStayReservation(
      request.reservationId,
      request.reservationCode,
    );
    if (!reservation) {
      return undefined;
    }
    const active = this.findLatestStay({
      reservationId: reservation.reservation_id,
      roomId: result.roomId,
      status: 'inHouse',
    });
    if (active) {
      return active;
    }
    const timestamp = nonEmptyString(
      result.auditEntry.occurredAt,
      request.requestedAt,
    );
    const stayId = stayIdForCheckIn(
      reservation.reservation_id,
      result.roomId,
      request.idempotencyKey,
    );
    this.saveStay(
      reservation.reservation_id,
      {
        stayId,
        roomId: result.roomId,
        roomNumber: result.roomNumber,
        checkedInAt: timestamp,
        status: 'inHouse',
      },
      timestamp,
    );
    return this.findLatestStay({
      reservationId: reservation.reservation_id,
      roomId: result.roomId,
      status: 'inHouse',
    });
  }

  protected recordCheckOutStayFromConfirm(
    request: CheckOutConfirmApiRequest,
    result: CoreCheckOutConfirmResult,
  ): PmsSandboxStayReadback | undefined {
    const hasReservationIdentity = Boolean(
      optionalString(request.reservationId) ||
      optionalString(request.reservationCode),
    );
    const reservation = this.resolveStayReservation(
      request.reservationId,
      request.reservationCode,
    );
    if (hasReservationIdentity && !reservation) {
      return undefined;
    }
    const active = this.findLatestStay({
      reservationId: reservation?.reservation_id,
      roomId: result.roomId,
      status: 'inHouse',
    });
    if (!active) {
      return this.findLatestStay({
        reservationId: reservation?.reservation_id,
        roomId: result.roomId,
        status: 'checkedOut',
      });
    }
    const timestamp = nonEmptyString(
      result.auditEntry.occurredAt,
      request.requestedAt,
    );
    this.saveStay(
      active.reservationId,
      {
        stayId: active.stayId,
        roomId: active.roomId ?? result.roomId,
        roomNumber: active.roomNumber ?? result.roomNumber,
        checkedInAt: active.checkedInAt,
        checkedOutAt: timestamp,
        status: 'checkedOut',
      },
      timestamp,
    );
    return this.findLatestStay({
      reservationId: active.reservationId,
      roomId: result.roomId,
      status: 'checkedOut',
    });
  }
}

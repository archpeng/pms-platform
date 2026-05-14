import type {
  ReservationCancelPendingActionRef,
  ReservationDraftAuditRef,
} from '@pms-platform/contracts';
import {
  type ReservationCancelPrepareApiRequest,
  type ReservationCancelPrepareApiResponse,
} from '../index.js';
import {
  addHoursIso,
  nonEmptyString,
  reservationCancelActionFromRow,
  reservationCancelActionIdFromClientToken,
  reservationCancelPrepareRejectedResponse,
  reservationCancelPrepareSuccessResponse,
  reservationCancelTokenConflictResponse,
  reservationDraftAuditId,
  reservationDraftDerivedRef,
  type ReservationCancelActionRow,
  type StoredReservationCancelAction,
} from './model.js';
import { SqliteSandboxReservationMaterializationStore } from './reservationMaterializationStore.js';

export abstract class SqliteSandboxReservationCancelActionStore extends SqliteSandboxReservationMaterializationStore {
  prepareReservationCancel(
    request: ReservationCancelPrepareApiRequest,
  ): ReservationCancelPrepareApiResponse {
    return this.runInTransaction(() =>
      this.prepareReservationCancelRecord(request),
    );
  }

  protected prepareReservationCancelRecord(
    request: ReservationCancelPrepareApiRequest,
  ): ReservationCancelPrepareApiResponse {
    const replay = this.reservationCancelReplayOrConflict(request);
    if (replay) return replay;

    const requestedAt = nonEmptyString(request.requestedAt, this.now());
    const row = this.resolveStayReservation(request.reservationId, request.reservationCode);
    if (!row) {
      return reservationCancelPrepareRejectedResponse(
        request,
        'RESERVATION_CANCEL_NOT_FOUND',
        'Reservation was not found.',
        request.reservationId ? 'reservationId' : 'reservationCode',
      );
    }
    const reservation = this.reservationReadModelFromRow(row, requestedAt);
    if (reservation.status !== 'booked') {
      return reservationCancelPrepareRejectedResponse(
        request,
        'RESERVATION_CANCEL_NOT_ACTIVE',
        'Only booked reservations can be cancelled through this workflow.',
        'status',
        reservation,
      );
    }

    const expiresAt = nonEmptyString(request.expiresAt, addHoursIso(requestedAt, 24));
    const cancelActionId = reservationCancelActionIdFromClientToken(request.clientToken);
    const pendingAction = reservationCancelPendingAction({
      cancelActionId,
      reservationId: row.reservation_id,
      reservationCode: row.reservation_code,
      requestedAt,
      expiresAt,
    });
    const action: StoredReservationCancelAction = {
      cancelActionId,
      propertyId: nonEmptyString(request.propertyId, row.property_id),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      reservationId: row.reservation_id,
      reservationCode: row.reservation_code,
      reason: request.reason,
      status: 'awaitingConfirmation',
      pendingAction,
      expiresAt,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    };
    this.saveReservationCancelAction(action);
    const auditRef = this.appendReservationCancelActionAudit(
      cancelActionId,
      'reservationCancelPrepared',
      requestedAt,
      { reservationId: row.reservation_id, reservationCode: row.reservation_code, reason: request.reason },
    );
    const response = reservationCancelPrepareSuccessResponse(action, reservation, [auditRef]);
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  protected getReservationCancelActionByPendingActionRef(
    pendingActionRef: string,
  ): StoredReservationCancelAction | undefined {
    return this.listReservationCancelActions().find(
      (action) => action.pendingAction.pendingActionRef === pendingActionRef,
    );
  }

  protected saveReservationCancelAction(action: StoredReservationCancelAction): void {
    this.db
      .prepare(
        `
          INSERT INTO reservation_cancel_actions (
            cancel_action_id, property_id, client_token, request_fingerprint, reservation_id,
            reservation_code, reason, status, pending_action_json, expires_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cancel_action_id) DO UPDATE SET
            client_token = excluded.client_token,
            request_fingerprint = excluded.request_fingerprint,
            reason = excluded.reason,
            status = excluded.status,
            pending_action_json = excluded.pending_action_json,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        action.cancelActionId,
        action.propertyId,
        action.clientToken,
        action.requestFingerprint,
        action.reservationId,
        action.reservationCode,
        action.reason,
        action.status,
        JSON.stringify(action.pendingAction),
        action.expiresAt,
        action.createdAt,
        action.updatedAt,
      );
  }

  protected appendReservationCancelActionAudit(
    cancelActionId: string,
    action: ReservationDraftAuditRef['action'],
    occurredAt: string,
    payload: unknown,
  ): ReservationDraftAuditRef {
    const auditRef: ReservationDraftAuditRef = {
      auditId: reservationDraftAuditId(
        cancelActionId,
        action,
        occurredAt,
        this.listReservationCancelActionAudits().length + 1,
      ),
      action,
      occurredAt,
    };
    this.db
      .prepare(
        `
          INSERT INTO reservation_cancel_action_audits (audit_id, cancel_action_id, action, occurred_at, payload_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(auditRef.auditId, cancelActionId, action, occurredAt, JSON.stringify(payload));
    return auditRef;
  }

  protected listReservationCancelActionAudits(): ReservationDraftAuditRef[] {
    const rows = this.db
      .prepare(
        'SELECT audit_id, action, occurred_at FROM reservation_cancel_action_audits ORDER BY occurred_at, audit_id',
      )
      .all() as Array<{ audit_id: string; action: ReservationDraftAuditRef['action']; occurred_at: string }>;
    return rows.map((row) => ({
      auditId: row.audit_id,
      action: row.action,
      occurredAt: row.occurred_at,
    }));
  }

  protected reservationCancelReplayOrConflict(
    request: ReservationCancelPrepareApiRequest,
  ): ReservationCancelPrepareApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (
      existing.requestFingerprint !== request.requestFingerprint ||
      !('operation' in existing.response) ||
      existing.response.operation !== request.operation
    ) {
      return reservationCancelTokenConflictResponse(request);
    }
    return existing.response as ReservationCancelPrepareApiResponse;
  }

  private listReservationCancelActions(): StoredReservationCancelAction[] {
    const rows = this.db
      .prepare('SELECT * FROM reservation_cancel_actions ORDER BY created_at, cancel_action_id')
      .all() as unknown as ReservationCancelActionRow[];
    return rows.map(reservationCancelActionFromRow);
  }
}

function reservationCancelPendingAction(input: {
  cancelActionId: string;
  reservationId: string;
  reservationCode: string;
  requestedAt: string;
  expiresAt: string;
}): ReservationCancelPendingActionRef {
  return {
    pendingActionRef: reservationDraftDerivedRef(
      'pending-action',
      `reservation-cancel:${input.cancelActionId}`,
    ),
    cardPayloadRef: reservationDraftDerivedRef(
      'card-payload',
      `reservation-cancel:${input.cancelActionId}`,
    ),
    reservationId: input.reservationId,
    reservationCode: input.reservationCode,
    generatedAt: input.requestedAt,
    updatedAt: input.requestedAt,
    expiresAt: input.expiresAt,
    status: 'awaitingConfirmation',
    confirmationMode: 'typedCardOnly',
    mutationStatus: 'none',
  };
}

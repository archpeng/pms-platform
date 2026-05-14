import {
  type ReservationDraftPendingActionRef,
  type ReservationGroupDraftPendingActionRef,
} from '@pms-platform/contracts';
import {
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  type PendingActionCallbackApiRequest,
  type PendingActionCallbackApiResponse,
  type PendingActionCancelApiRequest,
  type PendingActionConfirmApiRequest,
  type PendingActionStatusApiRequest,
} from '../index.js';
import {
  StoredReservationDraft,
  StoredReservationGroupDraft,
  cloneValue,
  isPendingActionCallbackResponse,
  nonEmptyString,
  pendingActionCardPayloadMismatchResponse,
  pendingActionCardPayloadMismatchResponseFromGroup,
  pendingActionExpiredResponse,
  pendingActionExpiredResponseFromGroup,
  pendingActionInactiveResponse,
  pendingActionInactiveResponseFromGroup,
  pendingActionNotFoundResponse,
  pendingActionRejectedResponseFromCancelAction,
  pendingActionSuccessResponse,
  pendingActionSuccessResponseFromCancelAction,
  pendingActionSuccessResponseFromGroup,
  pendingActionTokenConflictResponse,
  redactedPendingActionAuditPayload,
  type StoredReservationCancelAction,
} from './model.js';
import { SqliteSandboxReservationCancelActionStore } from './reservationCancelActionStore.js';

export abstract class SqliteSandboxPendingActionStore extends SqliteSandboxReservationCancelActionStore {
  getPendingActionStatus(
    request: PendingActionStatusApiRequest,
  ): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.readPendingActionRecord(request));
  }

  confirmPendingAction(
    request: PendingActionConfirmApiRequest,
  ): PendingActionCallbackApiResponse {
    return this.runInTransaction(() =>
      this.transitionPendingActionRecord(request, 'confirmed'),
    );
  }

  cancelPendingAction(
    request: PendingActionCancelApiRequest,
  ): PendingActionCallbackApiResponse {
    return this.runInTransaction(() =>
      this.transitionPendingActionRecord(request, 'cancelled'),
    );
  }

  protected readPendingActionRecord(
    request: PendingActionStatusApiRequest,
  ): PendingActionCallbackApiResponse {
    const replay = this.pendingActionReplayOrConflict(request);
    if (replay) return replay;

    const draft = this.getReservationDraftByPendingActionRef(
      request.pendingActionRef,
    );
    if (draft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expirePendingActionIfNeeded(
        request,
        draft,
        requestedAt,
      );
      if (expired) return expired;
      const auditRef = this.appendReservationDraftAudit(
        draft.draftId,
        'pendingActionStatusRead',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const response = pendingActionSuccessResponse(
        request.operation ?? pmsPendingActionStatusOperation,
        'statusRead',
        'none',
        draft,
        [auditRef],
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(
      request.pendingActionRef,
    );
    if (groupDraft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expireGroupPendingActionIfNeeded(
        request,
        groupDraft,
        requestedAt,
      );
      if (expired) return expired;
      const auditRef = this.appendReservationGroupDraftAudit(
        groupDraft.groupDraftId,
        'pendingActionStatusRead',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const response = pendingActionSuccessResponseFromGroup(
        request.operation ?? pmsPendingActionStatusOperation,
        'statusRead',
        'none',
        groupDraft,
        [auditRef],
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    const cancelAction = this.getReservationCancelActionByPendingActionRef(
      request.pendingActionRef,
    );
    if (cancelAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expireReservationCancelPendingActionIfNeeded(
        request,
        cancelAction,
        requestedAt,
      );
      if (expired) return expired;
      const auditRef = this.appendReservationCancelActionAudit(
        cancelAction.cancelActionId,
        'reservationCancelStatusRead',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const response = pendingActionSuccessResponseFromCancelAction(
        request.operation ?? pmsPendingActionStatusOperation,
        'statusRead',
        'none',
        cancelAction,
        [auditRef],
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    return pendingActionNotFoundResponse(request);
  }

  protected transitionPendingActionRecord(
    request: PendingActionConfirmApiRequest | PendingActionCancelApiRequest,
    transition: 'confirmed' | 'cancelled',
  ): PendingActionCallbackApiResponse {
    const replay = this.pendingActionReplayOrConflict(request);
    if (replay) return replay;

    const draft = this.getReservationDraftByPendingActionRef(
      request.pendingActionRef,
    );
    const requestedAt = nonEmptyString(request.requestedAt, this.now());
    if (draft?.pendingAction) {
      const expired = this.expirePendingActionIfNeeded(
        request,
        draft,
        requestedAt,
      );
      if (expired) return expired;
      if (
        request.cardPayloadRef &&
        request.cardPayloadRef !== draft.pendingAction.cardPayloadRef
      )
        return pendingActionCardPayloadMismatchResponse(request, draft);
      if (
        draft.pendingAction.status !== 'awaitingConfirmation' ||
        draft.status !== 'awaitingConfirmation'
      )
        return pendingActionInactiveResponse(request, draft);
      if (transition === 'confirmed') {
        const rejection = this.reservationDraftMaterializationRejection(
          request,
          draft,
        );
        if (rejection) return rejection;
      }

      const pendingAction: ReservationDraftPendingActionRef = {
        ...draft.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'committed' : 'none',
        updatedAt: requestedAt,
      };
      const updated: StoredReservationDraft = {
        ...draft,
        clientToken: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        status: transition === 'cancelled' ? 'cancelled' : draft.status,
        pendingAction,
        updatedAt: requestedAt,
      };
      this.saveReservationDraft(updated);
      const auditRef = this.appendReservationDraftAudit(
        updated.draftId,
        transition === 'confirmed'
          ? 'pendingActionConfirmed'
          : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const reservation =
        transition === 'confirmed'
          ? this.materializeConfirmedReservationDraft(updated, requestedAt)
          : undefined;
      const response = pendingActionSuccessResponse(
        request.operation ??
          (transition === 'confirmed'
            ? pmsPendingActionConfirmOperation
            : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'committed' : 'none',
        updated,
        [auditRef],
        reservation,
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(
      request.pendingActionRef,
    );
    if (groupDraft?.pendingAction) {
      const expired = this.expireGroupPendingActionIfNeeded(
        request,
        groupDraft,
        requestedAt,
      );
      if (expired) return expired;
      if (
        request.cardPayloadRef &&
        request.cardPayloadRef !== groupDraft.pendingAction.cardPayloadRef
      )
        return pendingActionCardPayloadMismatchResponseFromGroup(
          request,
          groupDraft,
        );
      if (
        groupDraft.pendingAction.status !== 'awaitingConfirmation' ||
        groupDraft.status !== 'awaitingConfirmation'
      )
        return pendingActionInactiveResponseFromGroup(request, groupDraft);
      if (transition === 'confirmed') {
        const rejection = this.reservationGroupDraftMaterializationRejection(
          request,
          groupDraft,
        );
        if (rejection) return rejection;
      }

      const pendingAction: ReservationGroupDraftPendingActionRef = {
        ...groupDraft.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'committed' : 'none',
        updatedAt: requestedAt,
      };
      const updated: StoredReservationGroupDraft = {
        ...groupDraft,
        clientToken: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        status: transition === 'cancelled' ? 'cancelled' : groupDraft.status,
        pendingAction,
        updatedAt: requestedAt,
      };
      this.saveReservationGroupDraft(updated);
      const auditRef = this.appendReservationGroupDraftAudit(
        updated.groupDraftId,
        transition === 'confirmed'
          ? 'pendingActionConfirmed'
          : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      if (transition === 'confirmed') {
        this.materializeConfirmedReservationGroupDraft(updated, requestedAt);
      }
      const response = pendingActionSuccessResponseFromGroup(
        request.operation ??
          (transition === 'confirmed'
            ? pmsPendingActionConfirmOperation
            : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'committed' : 'none',
        updated,
        [auditRef],
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    const cancelAction = this.getReservationCancelActionByPendingActionRef(
      request.pendingActionRef,
    );
    if (cancelAction) {
      const expired = this.expireReservationCancelPendingActionIfNeeded(
        request,
        cancelAction,
        requestedAt,
      );
      if (expired) return expired;
      if (
        request.cardPayloadRef &&
        request.cardPayloadRef !== cancelAction.pendingAction.cardPayloadRef
      ) {
        return pendingActionRejectedResponseFromCancelAction(
          request,
          cancelAction,
          'PENDING_ACTION_CARD_PAYLOAD_MISMATCH',
          'Card payload ref does not match the pending action.',
          'cardPayloadRef',
        );
      }
      if (
        cancelAction.pendingAction.status !== 'awaitingConfirmation' ||
        cancelAction.status !== 'awaitingConfirmation'
      ) {
        return pendingActionRejectedResponseFromCancelAction(
          request,
          cancelAction,
          'PENDING_ACTION_NOT_ACTIVE',
          'Pending action is no longer awaiting typed-card confirmation.',
          'status',
        );
      }
      const reservationRow = this.resolveStayReservation(
        cancelAction.reservationId,
        cancelAction.reservationCode,
      );
      const reservationBefore = reservationRow
        ? this.reservationReadModelFromRow(reservationRow, requestedAt)
        : undefined;
      if (transition === 'confirmed' && !reservationBefore) {
        return pendingActionRejectedResponseFromCancelAction(
          request,
          cancelAction,
          'RESERVATION_CANCEL_NOT_FOUND',
          'Reservation was not found.',
          'reservationId',
        );
      }
      if (transition === 'confirmed' && reservationBefore?.status !== 'booked') {
        return pendingActionRejectedResponseFromCancelAction(
          request,
          cancelAction,
          'RESERVATION_CANCEL_NOT_ACTIVE',
          'Only booked reservations can be cancelled through this workflow.',
          'status',
        );
      }

      const pendingAction = {
        ...cancelAction.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'committed' : 'none',
        updatedAt: requestedAt,
      } as const;
      const updated = {
        ...cancelAction,
        clientToken: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        status: transition,
        pendingAction,
        updatedAt: requestedAt,
      };
      this.saveReservationCancelAction(updated);
      const auditRef = this.appendReservationCancelActionAudit(
        updated.cancelActionId,
        transition === 'confirmed'
          ? 'reservationCancelConfirmed'
          : 'reservationCancelCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const reservation =
        transition === 'confirmed'
          ? this.cancelReservationRecord(updated.reservationId, requestedAt)
          : undefined;
      const response = pendingActionSuccessResponseFromCancelAction(
        request.operation ??
          (transition === 'confirmed'
            ? pmsPendingActionConfirmOperation
            : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'committed' : 'none',
        updated,
        [auditRef],
        reservation,
      );
      this.saveApiIdempotency({
        idempotencyKey: request.clientToken,
        requestFingerprint: request.requestFingerprint,
        response,
      });
      return response;
    }

    return pendingActionNotFoundResponse(request);
  }

  protected pendingActionReplayOrConflict(
    request: PendingActionCallbackApiRequest,
  ): PendingActionCallbackApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (
      existing.requestFingerprint !== request.requestFingerprint ||
      !isPendingActionCallbackResponse(existing.response)
    ) {
      return pendingActionTokenConflictResponse(request);
    }
    return cloneValue(existing.response);
  }

  protected expirePendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (
      !draft.pendingAction ||
      draft.pendingAction.status !== 'awaitingConfirmation'
    )
      return undefined;
    const expiresAt = draft.pendingAction.expiresAt ?? draft.expiresAt;
    if (expiresAt > requestedAt) return undefined;
    const pendingAction: ReservationDraftPendingActionRef = {
      ...draft.pendingAction,
      status: 'expired',
      mutationStatus: 'none',
      updatedAt: requestedAt,
    };
    const expired: StoredReservationDraft = {
      ...draft,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'expired',
      pendingAction,
      updatedAt: requestedAt,
    };
    this.saveReservationDraft(expired);
    const auditRef = this.appendReservationDraftAudit(
      expired.draftId,
      'pendingActionExpired',
      requestedAt,
      redactedPendingActionAuditPayload(request),
    );
    return pendingActionExpiredResponse(request, expired, [auditRef]);
  }

  protected expireGroupPendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationGroupDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (
      !draft.pendingAction ||
      draft.pendingAction.status !== 'awaitingConfirmation'
    )
      return undefined;
    const expiresAt = draft.pendingAction.expiresAt ?? draft.expiresAt;
    if (expiresAt > requestedAt) return undefined;
    const pendingAction: ReservationGroupDraftPendingActionRef = {
      ...draft.pendingAction,
      status: 'expired',
      mutationStatus: 'none',
      updatedAt: requestedAt,
    };
    const expired: StoredReservationGroupDraft = {
      ...draft,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'expired',
      pendingAction,
      updatedAt: requestedAt,
    };
    this.saveReservationGroupDraft(expired);
    const auditRef = this.appendReservationGroupDraftAudit(
      expired.groupDraftId,
      'pendingActionExpired',
      requestedAt,
      redactedPendingActionAuditPayload(request),
    );
    return pendingActionExpiredResponseFromGroup(request, expired, [auditRef]);
  }

  protected expireReservationCancelPendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    action: StoredReservationCancelAction,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (action.pendingAction.status !== 'awaitingConfirmation') return undefined;
    if (action.expiresAt > requestedAt) return undefined;
    const pendingAction = {
      ...action.pendingAction,
      status: 'expired' as const,
      mutationStatus: 'none' as const,
      updatedAt: requestedAt,
    };
    const expired = {
      ...action,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'expired' as const,
      pendingAction,
      updatedAt: requestedAt,
    };
    this.saveReservationCancelAction(expired);
    const auditRef = this.appendReservationCancelActionAudit(
      expired.cancelActionId,
      'reservationCancelExpired',
      requestedAt,
      redactedPendingActionAuditPayload(request),
    );
    return pendingActionRejectedResponseFromCancelAction(
      request,
      expired,
      'PENDING_ACTION_EXPIRED',
      'Pending action is expired and cannot be confirmed or cancelled.',
      'expiresAt',
    );
  }
}

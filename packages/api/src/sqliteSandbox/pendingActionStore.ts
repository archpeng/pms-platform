import {
type ReservationDraftPendingActionRef,
type ReservationGroupDraftPendingActionRef
} from '@pms-platform/contracts';
import {
pmsPendingActionCancelOperation,
pmsPendingActionConfirmOperation,
pmsPendingActionStatusOperation,
type PendingActionCallbackApiRequest,
type PendingActionCallbackApiResponse,
type PendingActionCancelApiRequest,
type PendingActionConfirmApiRequest,
type PendingActionStatusApiRequest
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
pendingActionSuccessResponse,
pendingActionSuccessResponseFromGroup,
pendingActionTokenConflictResponse,
redactedPendingActionAuditPayload
} from './model.js';
import { SqliteSandboxReservationMaterializationStore } from './reservationMaterializationStore.js';

export abstract class SqliteSandboxPendingActionStore extends SqliteSandboxReservationMaterializationStore {
  getPendingActionStatus(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.readPendingActionRecord(request));
  }

  confirmPendingAction(request: PendingActionConfirmApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.transitionPendingActionRecord(request, 'confirmed'));
  }

  cancelPendingAction(request: PendingActionCancelApiRequest): PendingActionCallbackApiResponse {
    return this.runInTransaction(() => this.transitionPendingActionRecord(request, 'cancelled'));
  }

  protected readPendingActionRecord(request: PendingActionStatusApiRequest): PendingActionCallbackApiResponse {
    const replay = this.pendingActionReplayOrConflict(request);
    if (replay) return replay;

    const draft = this.getReservationDraftByPendingActionRef(request.pendingActionRef);
    if (draft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expirePendingActionIfNeeded(request, draft, requestedAt);
      if (expired) return expired;
      const auditRef = this.appendReservationDraftAudit(draft.draftId, 'pendingActionStatusRead', requestedAt, redactedPendingActionAuditPayload(request));
      const response = pendingActionSuccessResponse(request.operation ?? pmsPendingActionStatusOperation, 'statusRead', 'none', draft, [auditRef]);
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(request.pendingActionRef);
    if (groupDraft?.pendingAction) {
      const requestedAt = nonEmptyString(request.requestedAt, this.now());
      const expired = this.expireGroupPendingActionIfNeeded(request, groupDraft, requestedAt);
      if (expired) return expired;
      const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'pendingActionStatusRead', requestedAt, redactedPendingActionAuditPayload(request));
      const response = pendingActionSuccessResponseFromGroup(request.operation ?? pmsPendingActionStatusOperation, 'statusRead', 'none', groupDraft, [auditRef]);
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
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

    const draft = this.getReservationDraftByPendingActionRef(request.pendingActionRef);
    const requestedAt = nonEmptyString(request.requestedAt, this.now());
    if (draft?.pendingAction) {
      const expired = this.expirePendingActionIfNeeded(request, draft, requestedAt);
      if (expired) return expired;
      if (request.cardPayloadRef && request.cardPayloadRef !== draft.pendingAction.cardPayloadRef) return pendingActionCardPayloadMismatchResponse(request, draft);
      if (draft.pendingAction.status !== 'awaitingConfirmation' || draft.status !== 'awaitingConfirmation') return pendingActionInactiveResponse(request, draft);
      if (transition === 'confirmed') {
        const rejection = this.reservationDraftMaterializationRejection(request, draft);
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
        transition === 'confirmed' ? 'pendingActionConfirmed' : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const reservation = transition === 'confirmed'
        ? this.materializeConfirmedReservationDraft(updated, requestedAt)
        : undefined;
      const response = pendingActionSuccessResponse(
        request.operation ?? (transition === 'confirmed' ? pmsPendingActionConfirmOperation : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'committed' : 'none',
        updated,
        [auditRef],
        reservation,
      );
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    const groupDraft = this.getReservationGroupDraftByPendingActionRef(request.pendingActionRef);
    if (groupDraft?.pendingAction) {
      const expired = this.expireGroupPendingActionIfNeeded(request, groupDraft, requestedAt);
      if (expired) return expired;
      if (request.cardPayloadRef && request.cardPayloadRef !== groupDraft.pendingAction.cardPayloadRef) return pendingActionCardPayloadMismatchResponseFromGroup(request, groupDraft);
      if (groupDraft.pendingAction.status !== 'awaitingConfirmation' || groupDraft.status !== 'awaitingConfirmation') return pendingActionInactiveResponseFromGroup(request, groupDraft);

      const pendingAction: ReservationGroupDraftPendingActionRef = {
        ...groupDraft.pendingAction,
        status: transition,
        mutationStatus: transition === 'confirmed' ? 'deferred' : 'none',
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
        transition === 'confirmed' ? 'pendingActionConfirmed' : 'pendingActionCancelled',
        requestedAt,
        redactedPendingActionAuditPayload(request),
      );
      const response = pendingActionSuccessResponseFromGroup(
        request.operation ?? (transition === 'confirmed' ? pmsPendingActionConfirmOperation : pmsPendingActionCancelOperation),
        transition,
        transition === 'confirmed' ? 'deferred' : 'none',
        updated,
        [auditRef],
      );
      this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
      return response;
    }

    return pendingActionNotFoundResponse(request);
  }

  protected pendingActionReplayOrConflict(request: PendingActionCallbackApiRequest): PendingActionCallbackApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint || !isPendingActionCallbackResponse(existing.response)) {
      return pendingActionTokenConflictResponse(request);
    }
    return cloneValue(existing.response);
  }

  protected expirePendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (!draft.pendingAction || draft.pendingAction.status !== 'awaitingConfirmation') return undefined;
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
    const auditRef = this.appendReservationDraftAudit(expired.draftId, 'pendingActionExpired', requestedAt, redactedPendingActionAuditPayload(request));
    return pendingActionExpiredResponse(request, expired, [auditRef]);
  }

  protected expireGroupPendingActionIfNeeded(
    request: PendingActionCallbackApiRequest,
    draft: StoredReservationGroupDraft,
    requestedAt: string,
  ): PendingActionCallbackApiResponse | undefined {
    if (!draft.pendingAction || draft.pendingAction.status !== 'awaitingConfirmation') return undefined;
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
    const auditRef = this.appendReservationGroupDraftAudit(expired.groupDraftId, 'pendingActionExpired', requestedAt, redactedPendingActionAuditPayload(request));
    return pendingActionExpiredResponseFromGroup(request, expired, [auditRef]);
  }
}

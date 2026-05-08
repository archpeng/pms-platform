import {
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationDraftWorkflowApiResponse,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
} from '../index.js';
import {
  StoredReservationDraft,
  addHoursIso,
  cloneValue,
  deriveMissingSlots,
  draftStatusFromMissingSlots,
  mergeEvidenceRefs,
  nonEmptyString,
  reservationDraftIdFromClientToken,
  reservationDraftInactiveResponse,
  reservationDraftMissingSlotsResponse,
  reservationDraftNotFoundResponse,
  reservationDraftPendingAction,
  reservationDraftQuote,
  reservationDraftQuoteMismatchResponse,
  reservationDraftQuoteRequiredResponse,
  reservationDraftSuccessResponse,
  reservationDraftTokenConflictResponse,
} from './model.js';
import { SqliteSandboxWorkflowTablesStore } from './workflowTablesStore.js';

export abstract class SqliteSandboxReservationDraftStore extends SqliteSandboxWorkflowTablesStore {
  createReservationDraft(
    request: ReservationDraftCreateApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() =>
      this.createReservationDraftRecord(request),
    );
  }

  updateReservationDraft(
    request: ReservationDraftUpdateApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() =>
      this.updateReservationDraftRecord(request),
    );
  }

  quoteReservationDraft(
    request: ReservationQuoteApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() =>
      this.quoteReservationDraftRecord(request),
    );
  }

  prepareConfirmReservationDraft(
    request: ReservationPrepareConfirmApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() =>
      this.prepareConfirmReservationDraftRecord(request),
    );
  }

  cancelReservationDraft(
    request: ReservationDraftCancelApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    return this.runInTransaction(() =>
      this.cancelReservationDraftRecord(request),
    );
  }

  protected createReservationDraftRecord(
    request: ReservationDraftCreateApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const expiresAt = nonEmptyString(
      request.expiresAt,
      addHoursIso(createdAt, 24),
    );
    const slots = cloneValue(request.slots ?? {});
    const missingSlots = deriveMissingSlots(slots);
    const status = draftStatusFromMissingSlots(
      missingSlots,
      expiresAt,
      createdAt,
    );
    const draft: StoredReservationDraft = {
      draftId: reservationDraftIdFromClientToken(request.clientToken),
      propertyId: nonEmptyString(request.propertyId, 'property-unknown'),
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs: cloneValue(request.evidenceRefs ?? []),
      expiresAt,
      createdAt,
      updatedAt: createdAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(
      draft.draftId,
      status === 'expired' ? 'expired' : 'created',
      createdAt,
      { request },
    );
    const response = reservationDraftSuccessResponse(
      request.operation,
      'created',
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

  protected updateReservationDraftRecord(
    request: ReservationDraftUpdateApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const slots = { ...existing.slots, ...(request.slots ?? {}) };
    const evidenceRefs = mergeEvidenceRefs(
      existing.evidenceRefs,
      request.evidenceRefs ?? [],
    );
    const missingSlots = cloneValue(
      request.missingSlots ?? deriveMissingSlots(slots),
    );
    const status =
      existing.status === 'cancelled'
        ? 'cancelled'
        : draftStatusFromMissingSlots(
            missingSlots,
            existing.expiresAt,
            updatedAt,
          );
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs,
      quote: status === 'cancelled' ? existing.quote : undefined,
      pendingAction:
        status === 'cancelled' ? existing.pendingAction : undefined,
      updatedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(
      draft.draftId,
      status === 'expired' ? 'expired' : 'updated',
      updatedAt,
      { request },
    );
    const response = reservationDraftSuccessResponse(
      request.operation,
      'updated',
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

  protected quoteReservationDraftRecord(
    request: ReservationQuoteApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);

    const quotedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationDraftInactiveResponse(
      request,
      existing,
      quotedAt,
    );
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0)
      return reservationDraftMissingSlotsResponse(request, existing);

    const quote = reservationDraftQuote(existing, quotedAt);
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'quoteReady',
      quote,
      updatedAt: quotedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(
      draft.draftId,
      'quoted',
      quotedAt,
      { request, quoteRef: quote.quoteRef },
    );
    const response = reservationDraftSuccessResponse(
      request.operation,
      'quoted',
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

  protected prepareConfirmReservationDraftRecord(
    request: ReservationPrepareConfirmApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);

    const preparedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationDraftInactiveResponse(
      request,
      existing,
      preparedAt,
    );
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0)
      return reservationDraftMissingSlotsResponse(request, existing);
    if (!existing.quote)
      return reservationDraftQuoteRequiredResponse(request, existing);
    if (request.quoteRef && request.quoteRef !== existing.quote.quoteRef)
      return reservationDraftQuoteMismatchResponse(request, existing);

    const pendingAction = reservationDraftPendingAction(
      existing,
      existing.quote.quoteRef,
      preparedAt,
    );
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'awaitingConfirmation',
      pendingAction,
      updatedAt: preparedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(
      draft.draftId,
      'prepared',
      preparedAt,
      {
        request,
        pendingActionRef: pendingAction.pendingActionRef,
        cardPayloadRef: pendingAction.cardPayloadRef,
      },
    );
    const response = reservationDraftSuccessResponse(
      request.operation,
      'prepared',
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

  protected cancelReservationDraftRecord(
    request: ReservationDraftCancelApiRequest,
  ): ReservationDraftWorkflowApiResponse {
    const replay = this.reservationDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationDraftByContext(request);
    if (!existing) return reservationDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const draft: StoredReservationDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'cancelled',
      updatedAt,
    };
    this.saveReservationDraft(draft);
    const auditRef = this.appendReservationDraftAudit(
      draft.draftId,
      'cancelled',
      updatedAt,
      { request, reason: request.reason },
    );
    const response = reservationDraftSuccessResponse(
      request.operation,
      'cancelled',
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

  protected reservationDraftReplayOrConflict(
    request:
      | ReservationDraftCreateApiRequest
      | ReservationDraftUpdateApiRequest
      | ReservationQuoteApiRequest
      | ReservationPrepareConfirmApiRequest
      | ReservationDraftCancelApiRequest,
  ): ReservationDraftWorkflowApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return reservationDraftTokenConflictResponse(request);
    }
    return cloneValue(existing.response) as ReservationDraftWorkflowApiResponse;
  }
}

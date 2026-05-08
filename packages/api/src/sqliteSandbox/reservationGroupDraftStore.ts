import {
type ReservationGroupDraftCancelApiRequest,
type ReservationGroupDraftCreateApiRequest,
type ReservationGroupDraftUpdateApiRequest,
type ReservationGroupDraftWorkflowApiResponse,
type ReservationGroupPrepareConfirmApiRequest,
type ReservationGroupQuoteApiRequest
} from '../index.js';
import {
StoredReservationGroupDraft,
addHoursIso,
cloneValue,
deriveGroupMissingSlots,
groupDraftStatusFromMissingSlots,
mergeEvidenceRefs,
nonEmptyString,
reservationGroupDraftIdFromClientToken,
reservationGroupDraftInactiveResponse,
reservationGroupDraftMissingSlotsResponse,
reservationGroupDraftNotFoundResponse,
reservationGroupDraftPendingAction,
reservationGroupDraftQuote,
reservationGroupDraftQuoteMismatchResponse,
reservationGroupDraftQuoteRequiredResponse,
reservationGroupDraftSuccessResponse,
reservationGroupDraftTokenConflictResponse
} from './model.js';
import { SqliteSandboxReservationDraftStore } from './reservationDraftStore.js';

export abstract class SqliteSandboxReservationGroupDraftStore extends SqliteSandboxReservationDraftStore {
  createReservationGroupDraft(request: ReservationGroupDraftCreateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.createReservationGroupDraftRecord(request));
  }

  updateReservationGroupDraft(request: ReservationGroupDraftUpdateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.updateReservationGroupDraftRecord(request));
  }

  quoteReservationGroupDraft(request: ReservationGroupQuoteApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.quoteReservationGroupDraftRecord(request));
  }

  prepareConfirmReservationGroupDraft(request: ReservationGroupPrepareConfirmApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.prepareConfirmReservationGroupDraftRecord(request));
  }

  cancelReservationGroupDraft(request: ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse {
    return this.runInTransaction(() => this.cancelReservationGroupDraftRecord(request));
  }

  protected createReservationGroupDraftRecord(request: ReservationGroupDraftCreateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const createdAt = nonEmptyString(request.requestedAt, this.now());
    const expiresAt = nonEmptyString(request.expiresAt, addHoursIso(createdAt, 24));
    const slots = cloneValue(request.slots ?? {});
    const missingSlots = deriveGroupMissingSlots(slots);
    const status = groupDraftStatusFromMissingSlots(missingSlots, expiresAt, createdAt);
    const groupDraft: StoredReservationGroupDraft = {
      groupDraftId: reservationGroupDraftIdFromClientToken(request.clientToken),
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
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, status === 'expired' ? 'expired' : 'created', createdAt, { request });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'created', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected updateReservationGroupDraftRecord(request: ReservationGroupDraftUpdateApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const slots = { ...existing.slots, ...(request.slots ?? {}) };
    const evidenceRefs = mergeEvidenceRefs(existing.evidenceRefs, request.evidenceRefs ?? []);
    const missingSlots = cloneValue(request.missingSlots ?? deriveGroupMissingSlots(slots));
    const status = existing.status === 'cancelled' ? 'cancelled' : groupDraftStatusFromMissingSlots(missingSlots, existing.expiresAt, updatedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status,
      slots,
      missingSlots,
      evidenceRefs,
      quote: status === 'cancelled' ? existing.quote : undefined,
      pendingAction: status === 'cancelled' ? existing.pendingAction : undefined,
      updatedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, status === 'expired' ? 'expired' : 'updated', updatedAt, { request });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'updated', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected quoteReservationGroupDraftRecord(request: ReservationGroupQuoteApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);

    const quotedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationGroupDraftInactiveResponse(request, existing, quotedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationGroupDraftMissingSlotsResponse(request, existing);

    const quote = reservationGroupDraftQuote(existing, quotedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'quoteReady',
      quote,
      updatedAt: quotedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'quoted', quotedAt, { request, quoteRef: quote.quoteRef });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'quoted', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected prepareConfirmReservationGroupDraftRecord(request: ReservationGroupPrepareConfirmApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);

    const preparedAt = nonEmptyString(request.requestedAt, this.now());
    const inactive = reservationGroupDraftInactiveResponse(request, existing, preparedAt);
    if (inactive) return inactive;
    if (existing.missingSlots.length > 0) return reservationGroupDraftMissingSlotsResponse(request, existing);
    if (!existing.quote) return reservationGroupDraftQuoteRequiredResponse(request, existing);
    if (request.quoteRef && request.quoteRef !== existing.quote.quoteRef) return reservationGroupDraftQuoteMismatchResponse(request, existing);

    const pendingAction = reservationGroupDraftPendingAction(existing, existing.quote.quoteRef, preparedAt);
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'awaitingConfirmation',
      pendingAction,
      updatedAt: preparedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'prepared', preparedAt, {
      request,
      pendingActionRef: pendingAction.pendingActionRef,
      cardPayloadRef: pendingAction.cardPayloadRef,
      selectionCount: pendingAction.selectionCount,
    });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'prepared', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected cancelReservationGroupDraftRecord(request: ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse {
    const replay = this.reservationGroupDraftReplayOrConflict(request);
    if (replay) return replay;

    const existing = this.getReservationGroupDraftByContext(request);
    if (!existing) return reservationGroupDraftNotFoundResponse(request);
    const updatedAt = nonEmptyString(request.requestedAt, this.now());
    const groupDraft: StoredReservationGroupDraft = {
      ...existing,
      clientToken: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      status: 'cancelled',
      updatedAt,
    };
    this.saveReservationGroupDraft(groupDraft);
    const auditRef = this.appendReservationGroupDraftAudit(groupDraft.groupDraftId, 'cancelled', updatedAt, { request, reason: request.reason });
    const response = reservationGroupDraftSuccessResponse(request.operation, 'cancelled', groupDraft, [auditRef]);
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected reservationGroupDraftReplayOrConflict(request: ReservationGroupDraftCreateApiRequest | ReservationGroupDraftUpdateApiRequest | ReservationGroupQuoteApiRequest | ReservationGroupPrepareConfirmApiRequest | ReservationGroupDraftCancelApiRequest): ReservationGroupDraftWorkflowApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return reservationGroupDraftTokenConflictResponse(request);
    }
    return cloneValue(existing.response) as ReservationGroupDraftWorkflowApiResponse;
  }
}

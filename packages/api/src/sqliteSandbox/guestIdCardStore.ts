import {
  pmsGuestIdCardArchiveOperation,
  pmsGuestIdCardConfirmOperation,
  pmsGuestIdCardPrepareOperation,
  type ApiErrorCode,
  type GuestIdCardArchiveApiRequest,
  type GuestIdCardArchiveApiResponse,
  type GuestIdCardArchiveFact,
  type GuestIdCardConfirmApiRequest,
  type GuestIdCardConfirmApiResponse,
  type GuestIdCardPrepareApiRequest,
  type GuestIdCardPrepareApiResponse,
  type GuestIdCardPreparationFact,
} from '../index.js';
import { cloneValue, nonEmptyString, optionalString, stableRefHash } from './model.js';
import { sqliteOptionalRow } from './sqliteRows.js';
import { SqliteSandboxReservationCreateStore } from './reservationCreateStore.js';

interface GuestReservationRow {
  readonly guest_id: string;
  readonly reservation_code: string;
  readonly display_name: string;
}

interface GuestIdCardDraftRow {
  readonly draft_id: string;
  readonly guest_id: string;
  readonly reservation_code: string;
  readonly property_id: string;
  readonly document_type: string;
  readonly holder_name: string;
  readonly id_number: string;
  readonly id_number_hash: string;
  readonly card_payload_ref: string;
  readonly status: string;
}

// Single-write guest ID-card archive. Keyed by (guest, documentType) so re-archiving the same
// document updates in place. Resolves the owning guest from a reservation ref (code or id).
export abstract class SqliteSandboxGuestIdCardStore extends SqliteSandboxReservationCreateStore {
  archiveGuestIdCard(request: GuestIdCardArchiveApiRequest): GuestIdCardArchiveApiResponse {
    return this.runInTransaction(() => this.archiveGuestIdCardRecord(request));
  }

  protected archiveGuestIdCardRecord(request: GuestIdCardArchiveApiRequest): GuestIdCardArchiveApiResponse {
    const replay = this.guestIdCardReplayOrConflict(request);
    if (replay) return replay;

    const name = optionalString(request.name);
    const idNumber = optionalString(request.idNumber);
    const idNumberHash = optionalString(request.idNumberHash);
    if (!name || !idNumber || !idNumberHash) {
      return guestIdCardRejected(
        request,
        'rejected',
        'GUEST_ID_CARD_MISSING_REQUIRED_FIELDS',
        'Guest ID-card archive requires a name, ID number, and ID number hash.',
        !name ? 'name' : !idNumber ? 'idNumber' : 'idNumberHash',
      );
    }

    const reservationRef = optionalString(request.reservationRef);
    const guestRow = reservationRef ? this.findGuestByReservationRef(reservationRef) : undefined;
    if (!guestRow) {
      return guestIdCardRejected(
        request,
        'notFound',
        'GUEST_ID_CARD_RESERVATION_NOT_FOUND',
        'No reservation was found for the requested guest reference.',
        'reservationRef',
      );
    }

    const documentType = optionalString(request.documentType) ?? 'national_id';
    const fact = this.persistGuestIdCard({
      guestId: guestRow.guest_id,
      reservationCode: guestRow.reservation_code,
      displayName: guestRow.display_name,
      propertyId: nonEmptyString(request.propertyId, 'property-small-hotel'),
      documentType,
      holderName: name,
      idNumber,
      idNumberHash,
      dob: optionalString(request.dob) ?? null,
      address: optionalString(request.address) ?? null,
      photoHash: optionalString(request.photoHash) ?? null,
    });
    const response: GuestIdCardArchiveApiResponse = {
      ok: true,
      operation: pmsGuestIdCardArchiveOperation,
      status: 'ok',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      idCard: fact,
    };
    this.saveApiIdempotency({
      idempotencyKey: request.clientToken,
      requestFingerprint: request.requestFingerprint,
      response,
    });
    return response;
  }

  prepareGuestIdCard(request: GuestIdCardPrepareApiRequest): GuestIdCardPrepareApiResponse {
    return this.runInTransaction(() => this.prepareGuestIdCardRecord(request));
  }

  confirmGuestIdCard(request: GuestIdCardConfirmApiRequest): GuestIdCardConfirmApiResponse {
    return this.runInTransaction(() => this.confirmGuestIdCardRecord(request));
  }

  protected prepareGuestIdCardRecord(request: GuestIdCardPrepareApiRequest): GuestIdCardPrepareApiResponse {
    const existing = this.getApiIdempotency(request.clientToken);
    if (existing) {
      if (existing.requestFingerprint !== request.requestFingerprint) {
        return preparePrepareRejected(request, 'rejected', 'GUEST_ID_CARD_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT', 'The guest ID-card client token was reused with a different request fingerprint.', 'requestFingerprint');
      }
      const replay = cloneValue(existing.response) as GuestIdCardPrepareApiResponse;
      return replay.ok ? { ...replay, idempotencyStatus: 'replayed' } : replay;
    }

    const name = optionalString(request.name);
    const idNumber = optionalString(request.idNumber);
    if (!name || !idNumber) {
      return preparePrepareRejected(request, 'rejected', 'GUEST_ID_CARD_MISSING_REQUIRED_FIELDS', 'Guest ID-card prepare requires a name and an ID number.', !name ? 'name' : 'idNumber');
    }
    const reservationRef = optionalString(request.reservationRef);
    const guestRow = reservationRef ? this.findGuestByReservationRef(reservationRef) : undefined;
    if (!guestRow) {
      return preparePrepareRejected(request, 'notFound', 'GUEST_ID_CARD_RESERVATION_NOT_FOUND', 'No reservation was found for the requested guest reference.', 'reservationRef');
    }

    const documentType = optionalString(request.documentType) ?? 'national_id';
    const idNumberHash = optionalString(request.idNumberHash) ?? stableRefHash(`guest-id-number:${idNumber}`);
    const timestamp = this.now();
    const draftId = stableRefHash(`guest-id-card-draft:${request.clientToken}`);
    const draftRef = `gidc-draft-${draftId.slice(0, 16)}`;
    const cardPayloadRef = stableRefHash(`guest-id-card-card:${draftId}:${idNumberHash}`);
    const expiresAt = optionalString(request.expiresAt) ?? timestamp;
    this.db
      .prepare(
        `
          INSERT INTO guest_id_card_drafts (
            draft_id, client_token, request_fingerprint, guest_id, reservation_code, property_id,
            document_type, holder_name, id_number, id_number_hash, card_payload_ref, status,
            expires_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaitingConfirmation', ?, ?, ?)
          ON CONFLICT(client_token) DO NOTHING
        `,
      )
      .run(
        draftId,
        request.clientToken,
        request.requestFingerprint,
        guestRow.guest_id,
        guestRow.reservation_code,
        nonEmptyString(request.propertyId, 'property-small-hotel'),
        documentType,
        name,
        idNumber,
        idNumberHash,
        cardPayloadRef,
        expiresAt,
        timestamp,
        timestamp,
      );

    const preparation: GuestIdCardPreparationFact = {
      draftRef,
      pendingActionRef: draftRef,
      cardPayloadRef,
      guestId: guestRow.guest_id,
      reservationCode: guestRow.reservation_code,
      displayName: guestRow.display_name,
      documentType,
      idNumberHash,
      maskedIdNumber: maskIdNumber(idNumber),
      status: 'awaitingConfirmation',
      expiresAt,
    };
    const response: GuestIdCardPrepareApiResponse = {
      ok: true,
      operation: pmsGuestIdCardPrepareOperation,
      status: 'ok',
      mutationStatus: 'none',
      idempotencyStatus: 'prepared',
      preparation,
    };
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  protected confirmGuestIdCardRecord(request: GuestIdCardConfirmApiRequest): GuestIdCardConfirmApiResponse {
    const existing = this.getApiIdempotency(request.clientToken);
    if (existing) {
      if (existing.requestFingerprint !== request.requestFingerprint) {
        return prepareConfirmRejected(request, 'rejected', 'GUEST_ID_CARD_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT', 'The guest ID-card confirm client token was reused with a different request fingerprint.', 'requestFingerprint');
      }
      const replay = cloneValue(existing.response) as GuestIdCardConfirmApiResponse;
      return replay.ok ? { ...replay, idempotencyStatus: 'replayed' } : replay;
    }

    const draft = this.getGuestIdCardDraftByRef(optionalString(request.pendingActionRef));
    if (!draft) {
      return prepareConfirmRejected(request, 'notFound', 'GUEST_ID_CARD_DRAFT_NOT_FOUND', 'No guest ID-card draft was found for the pending action.', 'pendingActionRef');
    }
    if (draft.card_payload_ref !== optionalString(request.cardPayloadRef)) {
      return prepareConfirmRejected(request, 'rejected', 'GUEST_ID_CARD_CARD_PAYLOAD_MISMATCH', 'The confirm card payload reference does not match the prepared draft.', 'cardPayloadRef');
    }
    if (draft.status !== 'awaitingConfirmation') {
      return prepareConfirmRejected(request, 'rejected', 'GUEST_ID_CARD_DRAFT_NOT_ACTIVE', 'The guest ID-card draft is no longer awaiting confirmation.', 'pendingActionRef');
    }

    const fact = this.persistGuestIdCard({
      guestId: draft.guest_id,
      reservationCode: draft.reservation_code,
      displayName: this.guestDisplayName(draft.guest_id) ?? draft.holder_name,
      propertyId: draft.property_id,
      documentType: draft.document_type,
      holderName: draft.holder_name,
      idNumber: draft.id_number,
      idNumberHash: draft.id_number_hash,
      dob: null,
      address: null,
      photoHash: null,
    });
    const timestamp = this.now();
    this.db.prepare('UPDATE guest_id_card_drafts SET status = ?, id_number = ?, updated_at = ? WHERE draft_id = ?')
      .run('confirmed', '', timestamp, draft.draft_id);

    const response: GuestIdCardConfirmApiResponse = {
      ok: true,
      operation: pmsGuestIdCardConfirmOperation,
      status: 'ok',
      mutationStatus: 'committed',
      idempotencyStatus: 'committed',
      idCard: fact,
    };
    this.saveApiIdempotency({ idempotencyKey: request.clientToken, requestFingerprint: request.requestFingerprint, response });
    return response;
  }

  private persistGuestIdCard(input: {
    guestId: string;
    reservationCode: string;
    displayName: string;
    propertyId: string;
    documentType: string;
    holderName: string;
    idNumber: string;
    idNumberHash: string;
    dob: string | null;
    address: string | null;
    photoHash: string | null;
  }): GuestIdCardArchiveFact {
    const timestamp = this.now();
    const idCardId = stableRefHash(`guest-id-card:${input.guestId}:${input.documentType}`);
    this.db
      .prepare(
        `
          INSERT INTO guest_id_cards (
            id_card_id, guest_id, property_id, document_type, holder_name,
            id_number, id_number_hash, dob, address, photo_hash, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id_card_id) DO UPDATE SET
            property_id = excluded.property_id,
            holder_name = excluded.holder_name,
            id_number = excluded.id_number,
            id_number_hash = excluded.id_number_hash,
            dob = excluded.dob,
            address = excluded.address,
            photo_hash = excluded.photo_hash,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        idCardId,
        input.guestId,
        input.propertyId,
        input.documentType,
        input.holderName,
        input.idNumber,
        input.idNumberHash,
        input.dob,
        input.address,
        input.photoHash,
        timestamp,
        timestamp,
      );
    return {
      guestId: input.guestId,
      reservationCode: input.reservationCode,
      displayName: input.displayName,
      documentType: input.documentType,
      idNumberHash: input.idNumberHash,
      status: 'archived',
      archivedAt: timestamp,
    };
  }

  private getGuestIdCardDraftByRef(draftRef: string | undefined): GuestIdCardDraftRow | undefined {
    if (!draftRef) return undefined;
    const draftId = draftRef.startsWith('gidc-draft-') ? draftRef.slice('gidc-draft-'.length) : draftRef;
    return sqliteOptionalRow<GuestIdCardDraftRow>(
      this.db
        .prepare('SELECT * FROM guest_id_card_drafts WHERE substr(draft_id, 1, 16) = ? OR draft_id = ? LIMIT 1')
        .get(draftId, draftRef),
    );
  }

  private guestDisplayName(guestId: string): string | undefined {
    const row = sqliteOptionalRow<{ display_name: string }>(
      this.db.prepare('SELECT display_name FROM guests WHERE guest_id = ? LIMIT 1').get(guestId),
    );
    return row?.display_name;
  }

  private findGuestByReservationRef(reservationRef: string): GuestReservationRow | undefined {
    return sqliteOptionalRow<GuestReservationRow>(
      this.db
        .prepare(
          `
            SELECT r.guest_id AS guest_id, r.reservation_code AS reservation_code, g.display_name AS display_name
            FROM reservations r
            INNER JOIN guests g ON g.guest_id = r.guest_id
            WHERE r.reservation_code = ? OR r.reservation_id = ?
            LIMIT 1
          `,
        )
        .get(reservationRef, reservationRef),
    );
  }

  private guestIdCardReplayOrConflict(
    request: GuestIdCardArchiveApiRequest,
  ): GuestIdCardArchiveApiResponse | undefined {
    const existing = this.getApiIdempotency(request.clientToken);
    if (!existing) return undefined;
    if (existing.requestFingerprint !== request.requestFingerprint) {
      return guestIdCardRejected(
        request,
        'rejected',
        'GUEST_ID_CARD_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT',
        'The guest ID-card client token was reused with a different request fingerprint.',
        'requestFingerprint',
      );
    }
    const response = cloneValue(existing.response) as GuestIdCardArchiveApiResponse;
    return response.ok ? { ...response, idempotencyStatus: 'replayed' } : response;
  }
}

function guestIdCardRejected(
  request: GuestIdCardArchiveApiRequest,
  status: 'rejected' | 'notFound',
  code: ApiErrorCode,
  message: string,
  field: string,
): GuestIdCardArchiveApiResponse {
  return {
    ok: false,
    operation: request.operation,
    status,
    mutationStatus: 'none',
    errors: [{ code, message, field }],
  };
}

function preparePrepareRejected(
  request: GuestIdCardPrepareApiRequest,
  status: 'rejected' | 'notFound',
  code: ApiErrorCode,
  message: string,
  field: string,
): GuestIdCardPrepareApiResponse {
  return { ok: false, operation: request.operation, status, mutationStatus: 'none', errors: [{ code, message, field }] };
}

function prepareConfirmRejected(
  request: GuestIdCardConfirmApiRequest,
  status: 'rejected' | 'notFound',
  code: ApiErrorCode,
  message: string,
  field: string,
): GuestIdCardConfirmApiResponse {
  return { ok: false, operation: request.operation, status, mutationStatus: 'none', errors: [{ code, message, field }] };
}

// Display-safe echo: keep the first 4 + last 4, mask the middle. Never stored, only surfaced for
// the staff to recognize the document on the approval card.
function maskIdNumber(idNumber: string): string {
  const trimmed = idNumber.trim();
  if (trimmed.length <= 8) return '*'.repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${'*'.repeat(trimmed.length - 8)}${trimmed.slice(-4)}`;
}

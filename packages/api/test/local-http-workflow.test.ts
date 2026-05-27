import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pmsAvailabilitySearchOperation,
  pmsCapabilityManifestOperation,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsHousekeepingDoneOperation,
  pmsReportMaintenanceOperation,
  pmsReservationAdjustOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type PmsExtendedCommandApiRequest,
} from '../src/index.js';
import {
  pmsLocalAuthTokenEnvName,
  startPmsLocalHttpServer,
  type PmsSandboxReservationImportRecord,
  type StartedPmsLocalHttpServer,
} from '../src/localSandbox.js';
import { createSqliteLocalSandboxStore, pmsSqliteDbPathEnvName } from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const authToken = 'test-local-auth-token';
const dueOutRoom: RoomAggregate = {
  roomId: 'room-1001',
  roomNumber: '1001',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A1',
  occupancyStatus: 'dueOut',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const vacantCleanRoom: RoomAggregate = {
  roomId: 'room-A2',
  roomNumber: 'A2',
  propertyId: 'property-small-hotel',
  roomTypeId: 'room-type-garden-villa',
  roomType: '花园别墅',
  zone: 'A',
  sortKey: 'A2',
  occupancyStatus: 'vacant',
  cleaningStatus: 'clean',
  saleStatus: 'sellable',
};
const vacantDirtyRoom: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
  cleaningStatus: 'dirty',
};

const dryRunRequest: CheckOutDryRunApiRequest = {
  operation: pmsCheckOutOperation,
  mode: 'dryRun',
  roomId: 'room-1001',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest departed and returned room cards.',
  idempotencyKey: 'live-sandbox-dry-run-room-1001',
  correlationId: 'corr-live-sandbox-room-1001',
  requestedAt: '2026-04-26T00:00:00.000Z',
  requestFingerprint: 'sha256:live-sandbox-dry-run-room-1001',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'live-sandbox-confirm-room-1001',
  requestFingerprint: 'sha256:live-sandbox-confirm-room-1001',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'confirm',
  roomId: 'room-A2',
  reservationId: 'res-A2-http',
  reservationCode: 'R-A2-HTTP',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest arrived with verified reservation.',
  idempotencyKey: 'live-sandbox-checkin-room-A2',
  correlationId: 'corr-live-sandbox-checkin-room-A2',
  requestedAt: '2026-04-26T15:00:00.000Z',
  requestFingerprint: 'sha256:live-sandbox-checkin-room-A2',
};

const tmpRoots: string[] = [];
const servers: StartedPmsLocalHttpServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('PMS local durable checkout sandbox HTTP boundary - local-http-workflow', () => {
  it('serves durable reservation draft lifecycle through HTTP without mutating final PMS state', async () => {
      const { url } = await startServer();
  
      const before = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
      const createBody = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'http-reservation-draft-create-1',
        requestFingerprint: 'sha256:http-reservation-draft-create-1',
        correlationId: 'corr-http-reservation-draft-create-1',
        requestedAt: '2026-05-02T00:00:00.000Z',
        slots: { guestDisplayName: 'Guest Draft', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomTypeKeyword: '花园' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-http-1' }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const create = await authedPost(`${url}/v1/pms/reservation-drafts/create`, createBody);
      const duplicate = await authedPost(`${url}/v1/pms/reservation-drafts/create`, createBody);
      const mismatch = await authedPost(`${url}/v1/pms/reservation-drafts/create`, {
        ...createBody,
        requestFingerprint: 'sha256:http-reservation-draft-create-1-different',
      });
      const draftRef = create.draft.draftRef;
      expect(draftRef).toMatch(/^[a-f0-9]{16}$/);
      expect(create.draft.draftId).toBeUndefined();
      const update = await authedPost(`${url}/v1/pms/reservation-drafts/update`, {
        ...createBody,
        operation: pmsReservationDraftUpdateOperation,
        clientToken: 'http-reservation-draft-update-1',
        requestFingerprint: 'sha256:http-reservation-draft-update-1',
        correlationId: 'corr-http-reservation-draft-update-1',
        requestedAt: '2026-05-02T00:01:00.000Z',
        draftRef,
        slots: { roomId: 'room-1001', selectedCandidateRef: 'availability-http-1:room-1001' },
        evidenceRefs: [{ source: 'userTurn', refId: 'turn-http-2' }],
      });
      const quote = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
        ...createBody,
        operation: pmsReservationQuoteOperation,
        clientToken: 'http-reservation-draft-quote-1',
        requestFingerprint: 'sha256:http-reservation-draft-quote-1',
        correlationId: 'corr-http-reservation-draft-quote-1',
        requestedAt: '2026-05-02T00:02:00.000Z',
        draftRef,
      });
      const duplicateQuote = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
        ...createBody,
        operation: pmsReservationQuoteOperation,
        clientToken: 'http-reservation-draft-quote-1',
        requestFingerprint: 'sha256:http-reservation-draft-quote-1',
        correlationId: 'corr-http-reservation-draft-quote-1',
        requestedAt: '2026-05-02T00:02:00.000Z',
        draftRef,
      });
      const quoteMismatch = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
        ...createBody,
        operation: pmsReservationQuoteOperation,
        clientToken: 'http-reservation-draft-quote-1',
        requestFingerprint: 'sha256:http-reservation-draft-quote-1-different',
        correlationId: 'corr-http-reservation-draft-quote-1',
        requestedAt: '2026-05-02T00:02:00.000Z',
        draftRef,
      });
      const quoteRef = quote.draft.quote.quoteRef;
      expect(quoteRef).toMatch(/^quote-[a-f0-9]{16}$/);
      expect(quoteRef).not.toContain('http-reservation-draft');
      const prepareConfirm = await authedPost(`${url}/v1/pms/reservation-drafts/prepare-confirm`, {
        operation: pmsReservationPrepareConfirmOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'http-reservation-prepare-1',
        requestFingerprint: 'sha256:http-reservation-prepare-1',
        correlationId: 'corr-http-reservation-prepare-1',
        requestedAt: '2026-05-02T00:03:00.000Z',
        draftRef,
        quoteRef,
      });
      const pendingActionRef = prepareConfirm.draft.pendingAction.pendingActionRef;
      const cardPayloadRef = prepareConfirm.draft.pendingAction.cardPayloadRef;
      expect(pendingActionRef).toMatch(/^pending-action-[a-f0-9]{16}$/);
      expect(cardPayloadRef).toMatch(/^card-payload-[a-f0-9]{16}$/);
      const pendingActionStatus = await authedPost(`${url}/v1/pms/pending-actions/status`, {
        operation: pmsPendingActionStatusOperation,
        pendingActionRef,
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-http-draft-status' },
        clientToken: 'http-reservation-pending-status-1',
        requestFingerprint: 'sha256:http-reservation-pending-status-1',
        correlationId: 'corr-http-reservation-pending-status-1',
        requestedAt: '2026-05-02T00:03:30.000Z',
        cardPayloadRef,
      });
      const cancel = await authedPost(`${url}/v1/pms/reservation-drafts/cancel`, {
        ...createBody,
        operation: pmsReservationDraftCancelOperation,
        clientToken: 'http-reservation-draft-cancel-1',
        requestFingerprint: 'sha256:http-reservation-draft-cancel-1',
        correlationId: 'corr-http-reservation-draft-cancel-1',
        requestedAt: '2026-05-02T00:04:00.000Z',
        draftRef,
        reason: 'guest changed plan',
      });
      const cancelledQuote = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
        ...createBody,
        operation: pmsReservationQuoteOperation,
        clientToken: 'http-reservation-draft-cancelled-quote-1',
        requestFingerprint: 'sha256:http-reservation-draft-cancelled-quote-1',
        correlationId: 'corr-http-reservation-draft-cancelled-quote-1',
        requestedAt: '2026-05-02T00:05:00.000Z',
        draftRef,
      });
      const after = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
  
      expect(create).toMatchObject({
        ok: true,
        operation: 'pms.reservation.draft.create',
        status: 'ok',
        mutationStatus: 'draftOnly',
        draft: { draftRef, workflowType: 'reservation', status: 'collectingSlots', evidenceRefs: [{ refId: 'availability-http-1' }] },
      });
      expect(duplicate).toEqual(create);
      expect(mismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(update).toMatchObject({ ok: true, operation: 'pms.reservation.draft.update', draft: { draftRef, slots: { roomId: 'room-1001' } } });
      for (const response of [create, update, quote, prepareConfirm, cancel]) expect(response.draft.draftId).toBeUndefined();
      expect([draftRef, quoteRef, pendingActionRef, cardPayloadRef].join(':')).not.toContain('Guest Draft');
      expect([draftRef, quoteRef, pendingActionRef, cardPayloadRef].join(':')).not.toContain('http-reservation-draft-create-1');
      expect(quote).toMatchObject({
        ok: true,
        operation: 'pms.reservation.quote',
        mutationStatus: 'draftOnly',
        draft: { draftRef, status: 'quoteReady', quote: { status: 'pricingUnsupported', capabilityGap: { code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED' } } },
      });
      expect(duplicateQuote).toEqual(quote);
      expect(quoteMismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(prepareConfirm).toMatchObject({
        ok: true,
        operation: 'pms.reservation.prepare_confirm',
        mutationStatus: 'draftOnly',
        draft: { draftRef, status: 'awaitingConfirmation', quote: { quoteRef }, pendingAction: { pendingActionRef, cardPayloadRef, quoteRef, confirmationMode: 'typedCardOnly', mutationStatus: 'none', status: 'awaitingConfirmation' } },
      });
      expect(pendingActionStatus).toMatchObject({
        ok: true,
        operation: 'pms.pending_action.status',
        mutationStatus: 'none',
        idempotencyStatus: 'statusRead',
        pendingAction: { pendingActionRef, quoteRef, cardPayloadRef, status: 'awaitingConfirmation', confirmationMode: 'typedCardOnly', mutationStatus: 'none' },
      });
      expect(pendingActionStatus.pendingAction.draftId).toBeUndefined();
      expect([draftRef, quoteRef, pendingActionRef, cardPayloadRef, JSON.stringify(pendingActionStatus.pendingAction)].join(':')).not.toContain('http-reservation-draft-create-1');
      expect(cancel).toMatchObject({ ok: true, operation: 'pms.reservation.draft.cancel', draft: { draftRef, status: 'cancelled' } });
      expect(cancelledQuote).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_NOT_ACTIVE' }] });
      expect(after.reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, status: 'cancelled', quote: expect.objectContaining({ quoteRef }), pendingAction: expect.objectContaining({ quoteRef }) })]));
      expect(after.reservationDraftAudits.map((audit: { action: string }) => audit.action)).toEqual(['created', 'updated', 'quoted', 'prepared', 'pendingActionStatusRead', 'cancelled']);
      expect(after.rooms).toEqual(before.rooms);
      expect(after.reservations).toEqual(before.reservations);
      expect(after.operationRequests).toEqual(before.operationRequests);
      expect(after.audits).toEqual([]);
      expect(after.domainEvents).toEqual([]);
    });
  
    
  
  it('serves platform pending-action confirm through HTTP and materializes a single-room reservation', async () => {
      const { url } = await startServer();
      const before = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
      const actor = { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' };
      const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-card-1' };
      const createBase = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'http-pending-draft-create-1',
        requestFingerprint: 'sha256:http-pending-draft-create-1',
        correlationId: 'corr-http-pending-draft-create-1',
        requestedAt: '2026-05-02T00:00:00.000Z',
        slots: { guestDisplayName: 'Pending Guest', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-pending-1:room-1001' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-pending-1' }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const create = await authedPost(`${url}/v1/pms/reservation-drafts/create`, createBase);
      const draftRef = create.draft.draftRef;
      const quote = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
        ...createBase,
        operation: pmsReservationQuoteOperation,
        clientToken: 'http-pending-draft-quote-1',
        requestFingerprint: 'sha256:http-pending-draft-quote-1',
        correlationId: 'corr-http-pending-draft-quote-1',
        requestedAt: '2026-05-02T00:01:00.000Z',
        draftRef,
      });
      const prepare = await authedPost(`${url}/v1/pms/reservation-drafts/prepare-confirm`, {
        ...createBase,
        operation: pmsReservationPrepareConfirmOperation,
        clientToken: 'http-pending-draft-prepare-1',
        requestFingerprint: 'sha256:http-pending-draft-prepare-1',
        correlationId: 'corr-http-pending-draft-prepare-1',
        requestedAt: '2026-05-02T00:02:00.000Z',
        draftRef,
        quoteRef: quote.draft.quote.quoteRef,
      });
      const pendingActionRef = prepare.draft.pendingAction.pendingActionRef;
      const cardPayloadRef = prepare.draft.pendingAction.cardPayloadRef;
      expect(quote.draft.quote.quoteRef).toMatch(/^quote-[a-f0-9]{16}$/);
      expect(pendingActionRef).toMatch(/^pending-action-[a-f0-9]{16}$/);
      expect(cardPayloadRef).toMatch(/^card-payload-[a-f0-9]{16}$/);
  
      const status = await authedPost(`${url}/v1/pms/pending-actions/status`, {
        operation: pmsPendingActionStatusOperation,
        pendingActionRef,
        actor,
        scope,
        clientToken: 'http-pending-action-status-1',
        requestFingerprint: 'sha256:http-pending-action-status-1',
        correlationId: 'corr-http-pending-action-status-1',
        requestedAt: '2026-05-02T00:03:00.000Z',
        cardPayloadRef,
      });
      const confirmRequest = {
        operation: pmsPendingActionConfirmOperation,
        pendingActionRef,
        actor,
        scope,
        clientToken: 'http-pending-action-confirm-1',
        requestFingerprint: 'sha256:http-pending-action-confirm-1',
        correlationId: 'corr-http-pending-action-confirm-1',
        requestedAt: '2026-05-02T00:04:00.000Z',
        cardPayloadRef,
      };
      const cardPayloadMismatch = await authedPost(`${url}/v1/pms/pending-actions/confirm`, {
        ...confirmRequest,
        clientToken: 'http-pending-action-card-mismatch-1',
        requestFingerprint: 'sha256:http-pending-action-card-mismatch-1',
        cardPayloadRef: 'card-payload-ref-tampered'
      });
      const confirm = await authedPost(`${url}/v1/pms/pending-actions/confirm`, confirmRequest);
      const replay = await authedPost(`${url}/v1/pms/pending-actions/confirm`, confirmRequest);
      const conflict = await authedPost(`${url}/v1/pms/pending-actions/confirm`, { ...confirmRequest, requestFingerprint: 'sha256:http-pending-action-confirm-different' });
      const after = await authedGet(`${url}/v1/sandbox/readback/room-1001`);
  
      expect(status).toMatchObject({ ok: true, operation: 'pms.pending_action.status', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation', cardPayloadRef } });
      expect(cardPayloadMismatch).toMatchObject({ ok: false, operation: 'pms.pending_action.confirm', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation', cardPayloadRef }, errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH', field: 'cardPayloadRef' }] });
      expect(confirm).toMatchObject({
        ok: true,
        operation: 'pms.pending_action.confirm',
        mutationStatus: 'committed',
        pendingAction: { pendingActionRef, status: 'confirmed', mutationStatus: 'committed' },
        reservation: {
          reservationCode: expect.stringMatching(/^R-[A-F0-9]{16}$/),
          roomId: 'room-1001',
          roomNumber: '1001',
          guestDisplayName: 'Pending Guest',
          arrivalDate: '2026-05-04',
          departureDate: '2026-05-05',
          status: 'booked'
        }
      });
      expect(replay).toEqual(confirm);
      expect(conflict).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(JSON.stringify(confirm)).not.toContain('frontdesk-1');
      expect(after.reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, status: 'awaitingConfirmation', pendingAction: expect.objectContaining({ pendingActionRef, status: 'confirmed', mutationStatus: 'committed' }) })]));
      expect(after.reservationDraftAudits.map((audit: { action: string }) => audit.action)).toEqual(expect.arrayContaining(['pendingActionStatusRead', 'pendingActionConfirmed']));
      expect(after.rooms).toEqual(before.rooms);
      expect(after.reservations).toEqual([
        expect.objectContaining({
          reservationCode: confirm.reservation.reservationCode,
          roomId: 'room-1001',
          roomNumber: '1001',
          guestDisplayName: 'Pending Guest',
          status: 'booked'
        })
      ]);
      expect(after.operationRequests).toEqual(before.operationRequests);
      expect(after.audits).toEqual([]);
      expect(after.domainEvents).toEqual([]);
      expect(after.projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'reservation', projectionKind: 'reservation', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' })
      ]));
  
      const createCancel = await authedPost(`${url}/v1/pms/reservation-drafts/create`, { ...createBase, clientToken: 'http-pending-cancel-create-1', requestFingerprint: 'sha256:http-pending-cancel-create-1', correlationId: 'corr-http-pending-cancel-create-1' });
      const cancelDraftRef = createCancel.draft.draftRef;
      const quoteCancel = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, { ...createBase, operation: pmsReservationQuoteOperation, clientToken: 'http-pending-cancel-quote-1', requestFingerprint: 'sha256:http-pending-cancel-quote-1', correlationId: 'corr-http-pending-cancel-quote-1', draftRef: cancelDraftRef });
      const prepareCancel = await authedPost(`${url}/v1/pms/reservation-drafts/prepare-confirm`, { ...createBase, operation: pmsReservationPrepareConfirmOperation, clientToken: 'http-pending-cancel-prepare-1', requestFingerprint: 'sha256:http-pending-cancel-prepare-1', correlationId: 'corr-http-pending-cancel-prepare-1', draftRef: cancelDraftRef, quoteRef: quoteCancel.draft.quote.quoteRef });
      const cancel = await authedPost(`${url}/v1/pms/pending-actions/cancel`, {
        operation: pmsPendingActionCancelOperation,
        pendingActionRef: prepareCancel.draft.pendingAction.pendingActionRef,
        actor,
        scope,
        clientToken: 'http-pending-action-cancel-1',
        requestFingerprint: 'sha256:http-pending-action-cancel-1',
        correlationId: 'corr-http-pending-action-cancel-1',
        requestedAt: '2026-05-02T00:05:00.000Z',
        cardPayloadRef: prepareCancel.draft.pendingAction.cardPayloadRef,
        reason: 'guest cancelled typed card action',
      });
      expect(cancel).toMatchObject({ ok: true, operation: 'pms.pending_action.cancel', mutationStatus: 'none', pendingAction: { status: 'cancelled', mutationStatus: 'none' } });
    });
  
    
  
  it('serves agent route-sequence smoke with typed HTTP routes and materialized group confirmation', async () => {
      const { url } = await startServer(undefined, true, [dueOutRoom, vacantCleanRoom]);
  
      const before = await authedGet(`${url}/v1/sandbox/readback`);
      const availability = await authedPost(`${url}/v1/pms/availability/search`, {
        operation: pmsAvailabilitySearchOperation,
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        roomTypeKeyword: '花园',
        requestedAt: '2026-05-02T01:00:00.000Z',
        count: 2,
      });
      const candidate = availability.readModel.candidates[0];
      const secondCandidate = availability.readModel.candidates[1];
      expect(availability).toMatchObject({
        ok: true,
        operation: 'pms_availability_search',
        readModel: { request: { startDate: '2026-05-04', endDate: '2026-05-05', roomTypeKeyword: '花园', count: 2 }, candidateCount: 2 },
      });
      expect(candidate).toMatchObject({ roomId: 'room-1001', roomNumber: '1001', availableDates: ['2026-05-04'] });
      expect(secondCandidate).toMatchObject({ roomId: 'room-A2', roomNumber: 'A2', availableDates: ['2026-05-04'] });
  
      const actor = { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' };
      const create = await authedPost(`${url}/v1/pms/reservation-group-drafts/create`, {
        operation: pmsReservationGroupDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'http-agent-sequence-group-draft-create-1',
        requestFingerprint: 'sha256:http-agent-sequence-group-draft-create-1',
        correlationId: 'corr-http-agent-sequence-group-draft-create-1',
        requestedAt: '2026-05-02T01:01:00.000Z',
        slots: { guestDisplayName: 'Route Sequence Group', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomTypeKeyword: '花园', quantity: 2 },
        evidenceRefs: [{ source: 'availabilitySearch', refId: `${availability.readModel.generatedAt}:group` }],
        expiresAt: '2026-05-03T01:00:00.000Z',
      });
      const groupDraftRef = create.groupDraft.groupDraftRef;
      expect(create).toMatchObject({ ok: true, operation: 'pms.reservation.group_draft.create', mutationStatus: 'draftOnly', groupDraft: { groupDraftRef, status: 'collectingSlots', missingSlots: ['roomSelections'] } });
  
      const update = await authedPost(`${url}/v1/pms/reservation-group-drafts/update`, {
        operation: pmsReservationGroupDraftUpdateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'http-agent-sequence-group-draft-update-1',
        requestFingerprint: 'sha256:http-agent-sequence-group-draft-update-1',
        correlationId: 'corr-http-agent-sequence-group-draft-update-1',
        requestedAt: '2026-05-02T01:02:00.000Z',
        groupDraftRef,
        slots: {
          selections: [
            { roomId: candidate.roomId, selectedCandidateRef: `${availability.readModel.generatedAt}:${candidate.roomId}`, roomTypeId: candidate.roomTypeId, roomType: candidate.roomType },
            { roomId: secondCandidate.roomId, selectedCandidateRef: `${availability.readModel.generatedAt}:${secondCandidate.roomId}`, roomTypeId: secondCandidate.roomTypeId, roomType: secondCandidate.roomType },
          ],
        },
        evidenceRefs: [{ source: 'availabilitySearch', refId: `${availability.readModel.generatedAt}:selected-group` }],
      });
      const quote = await authedPost(`${url}/v1/pms/reservation-group-drafts/quote`, {
        operation: pmsReservationGroupQuoteOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'http-agent-sequence-group-draft-quote-1',
        requestFingerprint: 'sha256:http-agent-sequence-group-draft-quote-1',
        correlationId: 'corr-http-agent-sequence-group-draft-quote-1',
        requestedAt: '2026-05-02T01:03:00.000Z',
        groupDraftRef,
      });
      const quoteRef = quote.groupDraft.quote.quoteRef;
      const prepareConfirm = await authedPost(`${url}/v1/pms/reservation-group-drafts/prepare-confirm`, {
        operation: pmsReservationGroupPrepareConfirmOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'http-agent-sequence-group-draft-prepare-1',
        requestFingerprint: 'sha256:http-agent-sequence-group-draft-prepare-1',
        correlationId: 'corr-http-agent-sequence-group-draft-prepare-1',
        requestedAt: '2026-05-02T01:04:00.000Z',
        groupDraftRef,
        quoteRef,
      });
      const pendingActionRef = prepareConfirm.groupDraft.pendingAction.pendingActionRef;
      const cardPayloadRef = prepareConfirm.groupDraft.pendingAction.cardPayloadRef;
      const status = await authedPost(`${url}/v1/pms/pending-actions/status`, {
        operation: pmsPendingActionStatusOperation,
        pendingActionRef,
        actor,
        scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-agent-sequence' },
        clientToken: 'http-agent-sequence-pending-status-1',
        requestFingerprint: 'sha256:http-agent-sequence-pending-status-1',
        correlationId: 'corr-http-agent-sequence-pending-status-1',
        requestedAt: '2026-05-02T01:05:00.000Z',
        cardPayloadRef,
      });
      const confirm = await authedPost(`${url}/v1/pms/pending-actions/confirm`, {
        operation: pmsPendingActionConfirmOperation,
        pendingActionRef,
        actor,
        scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-agent-sequence' },
        clientToken: 'http-agent-sequence-group-pending-confirm-1',
        requestFingerprint: 'sha256:http-agent-sequence-group-pending-confirm-1',
        correlationId: 'corr-http-agent-sequence-group-pending-confirm-1',
        requestedAt: '2026-05-02T01:06:00.000Z',
        cardPayloadRef,
      });
      const after = await authedGet(`${url}/v1/sandbox/readback`);
  
      expect(update).toMatchObject({ ok: true, operation: 'pms.reservation.group_draft.update', mutationStatus: 'draftOnly', groupDraft: { groupDraftRef, status: 'quoteReady', missingSlots: [], slots: { selections: [{ roomId: 'room-1001' }, { roomId: 'room-A2' }] } } });
      expect(quote).toMatchObject({ ok: true, operation: 'pms.reservation.group_quote', mutationStatus: 'draftOnly', groupDraft: { groupDraftRef, status: 'quoteReady', quote: { quoteRef, status: 'pricingUnsupported' } } });
      expect(prepareConfirm).toMatchObject({ ok: true, operation: 'pms.reservation.group_prepare_confirm', mutationStatus: 'draftOnly', groupDraft: { groupDraftRef, status: 'awaitingConfirmation', pendingAction: { pendingActionRef, quoteRef, cardPayloadRef, confirmationMode: 'typedCardOnly', mutationStatus: 'none', selectionCount: 2 } } });
      expect(status).toMatchObject({ ok: true, operation: 'pms.pending_action.status', mutationStatus: 'none', idempotencyStatus: 'statusRead', pendingAction: { workflowType: 'reservationGroup', pendingActionRef, quoteRef, cardPayloadRef, status: 'awaitingConfirmation', confirmationMode: 'typedCardOnly', mutationStatus: 'none' } });
      expect(confirm).toMatchObject({ ok: true, operation: 'pms.pending_action.confirm', mutationStatus: 'committed', idempotencyStatus: 'confirmed', pendingAction: { workflowType: 'reservationGroup', pendingActionRef, status: 'confirmed', mutationStatus: 'committed' } });
      expect(status.pendingAction.draftId).toBeUndefined();
      expect(status.pendingAction.groupDraftId).toBeUndefined();
      expect(after.reservationGroupDraftAudits.map((audit: { action: string }) => audit.action)).toEqual(['created', 'updated', 'quoted', 'prepared', 'pendingActionStatusRead', 'pendingActionConfirmed']);
      expect(after.reservationGroupDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ groupDraftRef, status: 'awaitingConfirmation', pendingAction: expect.objectContaining({ pendingActionRef, status: 'confirmed', selectionCount: 2 }) })]));
      expect(after.projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'reservationGroupDraftAudit', projectionKind: 'reservationWorkflow', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
      ]));
      expect(after.rooms).toEqual(before.rooms);
      expect(after.reservations).toEqual(expect.arrayContaining([
        expect.objectContaining({ roomId: candidate.roomId, guestDisplayName: 'Route Sequence Group', status: 'booked' }),
        expect.objectContaining({ roomId: secondCandidate.roomId, guestDisplayName: 'Route Sequence Group', status: 'booked' }),
      ]));
      expect(after.reservations).toHaveLength(before.reservations.length + 2);
      expect(after.operationRequests).toEqual(before.operationRequests);
      expect(after.audits).toEqual([]);
      expect(after.domainEvents).toEqual([]);
    });

  it('serves native reservation adjust through HTTP as a single committed PMS mutation', async () => {
      const { url } = await startServer(undefined, true, [vacantCleanRoom, vacantDirtyRoom], [
        {
          reservationId: 'res-http-adjust-original',
          reservationCode: 'R-HTTP-ADJUST',
          propertyId: 'property-small-hotel',
          roomId: 'room-A2',
          roomNumber: 'A2',
          guestDisplayName: 'HTTP Adjust Original',
          arrivalDate: '2026-05-04',
          departureDate: '2026-05-05',
          status: 'booked',
        },
      ]);
      const body = {
        operation: pmsReservationAdjustOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'http-adjust-1',
        requestFingerprint: 'sha256:http-adjust-1',
        correlationId: 'corr-http-adjust-1',
        requestedAt: '2026-05-02T02:00:00.000Z',
        reservationCode: 'R-HTTP-ADJUST',
        targetRoomId: 'room-A3',
        guestDisplayName: 'HTTP Adjusted',
        arrivalDate: '2026-05-06',
        departureDate: '2026-05-07',
      };

      const adjusted = await authedPost(`${url}/v1/pms/reservations/adjust`, body);
      const replayed = await authedPost(`${url}/v1/pms/reservations/adjust`, body);
      const after = await authedGet(`${url}/v1/sandbox/readback`);

      expect(adjusted).toMatchObject({
        ok: true,
        operation: 'pms.reservation.adjust',
        mutationStatus: 'committed',
        idempotencyStatus: 'committed',
        originalReservation: { reservationCode: 'R-HTTP-ADJUST', roomId: 'room-A2', status: 'booked' },
        reservation: { roomId: 'room-A3', roomNumber: 'A3', guestDisplayName: 'HTTP Adjusted', status: 'booked' },
      });
      expect(replayed).toMatchObject({ ok: true, idempotencyStatus: 'replayed', reservation: adjusted.reservation });
      expect(after.reservations).toEqual(expect.arrayContaining([
        expect.objectContaining({ reservationCode: 'R-HTTP-ADJUST', status: 'cancelled' }),
        expect.objectContaining({ reservationCode: adjusted.reservation.reservationCode, roomId: 'room-A3', status: 'booked' }),
      ]));
    });
  
    
});

async function startServer(
  existingPath?: string,
  resetOnStart = true,
  seedRooms: readonly RoomAggregate[] = [dueOutRoom],
  seedReservations: readonly PmsSandboxReservationImportRecord[] = [],
) {
  const tmpRoot = existingPath ? undefined : mkdtempSync(join(tmpdir(), 'pms-sandbox-'));
  if (tmpRoot) {
    tmpRoots.push(tmpRoot);
  }
  const dbPath = existingPath ?? join(tmpRoot!, 'pms.sqlite');
  const store = createSqliteLocalSandboxStore({
    dbPath,
    seedRooms,
    seedReservations,
    resetOnStart,
  });
  const started = await startPmsLocalHttpServer({
    store,
    auth: {
      token: authToken,
      required: true,
    },
  });
  servers.push(started);
  return { ...started, dbPath };
}

async function closeAllServers() {
  while (servers.length > 0) {
    await servers.pop()?.close();
  }
}

async function getJson(url: string) {
  const response = await fetch(url);
  return response.json();
}

async function authedGet(url: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function authedPost(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

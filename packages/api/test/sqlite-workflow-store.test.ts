import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeCheckInApiRequest,
  executeCheckOutApiRequest,
  executePmsExtendedCommandApiRequest,
  pmsCheckInOperation,
  pmsCheckOutOperation,
  pmsMaintenanceDoneOperation,
  pmsPendingActionCancelOperation,
  pmsPendingActionConfirmOperation,
  pmsPendingActionStatusOperation,
  pmsReportMaintenanceOperation,
  pmsReservationDraftCancelOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationDraftUpdateOperation,
  pmsReservationGroupDraftCancelOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsRestoreSellableOperation,
  type CheckInConfirmApiRequest,
  type CheckInDryRunApiRequest,
  type CheckOutConfirmApiRequest,
  type CheckOutDryRunApiRequest,
  type MaintenanceDoneApiRequest,
  type OperationRequestCreateApiRequest,
  type ReportMaintenanceApiRequest,
  type ReservationDraftCancelApiRequest,
  type ReservationDraftCreateApiRequest,
  type ReservationDraftUpdateApiRequest,
  type ReservationGroupDraftCreateApiRequest,
  type ReservationPrepareConfirmApiRequest,
  type ReservationQuoteApiRequest,
  type RestoreSellableApiRequest,
} from '../src/index.js';
import {
  createSqliteLocalSandboxStore,
  pmsSqliteDbPathEnvName,
} from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-04-28T00:00:00.000Z';
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
const vacantCleanRoomB: RoomAggregate = {
  ...vacantCleanRoom,
  roomId: 'room-A3',
  roomNumber: 'A3',
  sortKey: 'A3',
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
  idempotencyKey: 'sqlite-dry-run-room-1001',
  correlationId: 'corr-sqlite-room-1001',
  requestedAt: '2026-04-28T00:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-dry-run-room-1001',
};

const confirmRequest: CheckOutConfirmApiRequest = {
  ...dryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-confirm-room-1001',
  requestFingerprint: 'sha256:sqlite-confirm-room-1001',
};

const checkInDryRunRequest: CheckInDryRunApiRequest = {
  operation: pmsCheckInOperation,
  mode: 'dryRun',
  roomId: 'room-A2',
  reservationId: 'res-A2-checkin',
  reservationCode: 'R-A2-CHECKIN',
  actor: {
    type: 'human',
    id: 'frontdesk-1',
    displayName: 'Front Desk',
  },
  source: 'api',
  reason: 'Guest arrived with verified reservation.',
  idempotencyKey: 'sqlite-checkin-dry-run-room-A2',
  correlationId: 'corr-sqlite-checkin-room-A2',
  requestedAt: '2026-04-28T15:00:00.000Z',
  requestFingerprint: 'sha256:sqlite-checkin-dry-run-room-A2',
};

const checkInConfirmRequest: CheckInConfirmApiRequest = {
  ...checkInDryRunRequest,
  mode: 'confirm',
  idempotencyKey: 'sqlite-checkin-confirm-room-A2',
  requestFingerprint: 'sha256:sqlite-checkin-confirm-room-A2',
};

const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('SQLite local sandbox store - sqlite-workflow-store', () => {
  it('persists reservation draft lifecycle, idempotency, audit, cancel, and expiry without PMS mutations', () => {
      const dbPath = tempPath('reservation-drafts.sqlite');
      const store = createSqliteLocalSandboxStore({
        dbPath,
        seedRooms: [dueOutRoom],
        resetOnStart: true,
        now: () => now,
      });
      const createRequest: ReservationDraftCreateApiRequest = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'draft-sqlite-create-1',
        requestFingerprint: 'sha256:draft-sqlite-create-1',
        correlationId: 'corr-draft-sqlite-create-1',
        requestedAt: now,
        slots: { guestDisplayName: 'Guest Draft', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomTypeKeyword: '花园', selectedCandidateRef: 'availability-1:room-1001' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-1', generatedAt: now }],
        expiresAt: '2026-04-29T00:00:00.000Z',
      };
  
      const created = store.createReservationDraft(createRequest);
      const replayed = store.createReservationDraft(createRequest);
      const mismatch = store.createReservationDraft({ ...createRequest, requestFingerprint: 'sha256:draft-sqlite-create-1-different' });
      const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
      expect(draftRef).toMatch(/^[a-f0-9]{16}$/);
      expect(created.ok ? created.draft.draftId : undefined).toBeUndefined();
      const updateRequest: ReservationDraftUpdateApiRequest = {
        ...createRequest,
        operation: pmsReservationDraftUpdateOperation,
        clientToken: 'draft-sqlite-update-1',
        requestFingerprint: 'sha256:draft-sqlite-update-1',
        correlationId: 'corr-draft-sqlite-update-1',
        requestedAt: '2026-04-28T00:10:00.000Z',
        draftRef,
        slots: { roomId: 'room-1001', selectedCandidateRef: 'availability-1:room-1001' },
        evidenceRefs: [{ source: 'userTurn', refId: 'turn-2', generatedAt: '2026-04-28T00:10:00.000Z' }],
      };
      const updated = store.updateReservationDraft(updateRequest);
      const cancelRequest: ReservationDraftCancelApiRequest = {
        ...createRequest,
        operation: pmsReservationDraftCancelOperation,
        clientToken: 'draft-sqlite-cancel-1',
        requestFingerprint: 'sha256:draft-sqlite-cancel-1',
        correlationId: 'corr-draft-sqlite-cancel-1',
        requestedAt: '2026-04-28T00:20:00.000Z',
        draftRef,
        reason: 'guest changed plan',
      };
      const cancelled = store.cancelReservationDraft(cancelRequest);
  
      expect(created).toMatchObject({
        ok: true,
        operation: 'pms.reservation.draft.create',
        mutationStatus: 'draftOnly',
        idempotencyStatus: 'created',
        draft: {
          draftRef,
          status: 'quoteReady',
          slots: { guestDisplayName: 'Guest Draft', roomTypeKeyword: '花园' },
          missingSlots: [],
          evidenceRefs: [{ refId: 'availability-1' }],
          expiresAt: '2026-04-29T00:00:00.000Z',
        },
      });
      expect(replayed).toEqual(created);
      expect(mismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(updated).toMatchObject({ ok: true, operation: 'pms.reservation.draft.update', draft: { draftRef, slots: { roomId: 'room-1001' } } });
      for (const response of [created, updated, cancelled]) if (response.ok) expect(response.draft.draftId).toBeUndefined();
      expect(cancelled).toMatchObject({ ok: true, operation: 'pms.reservation.draft.cancel', draft: { draftRef, status: 'cancelled' } });
  
      const expired = store.createReservationDraft({
        ...createRequest,
        clientToken: 'draft-sqlite-expired-1',
        requestFingerprint: 'sha256:draft-sqlite-expired-1',
        requestedAt: '2026-04-30T00:00:00.000Z',
        expiresAt: '2026-04-29T00:00:00.000Z',
      });
      expect(expired).toMatchObject({ ok: true, draft: { status: 'expired' } });
  
      const readback = store.readback('room-1001');
      expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ draftRef, status: 'cancelled', missingSlots: [], evidenceRefs: expect.arrayContaining([expect.objectContaining({ refId: 'turn-2' })]) }),
        expect.objectContaining({ status: 'expired' }),
      ]));
      expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(['created', 'updated', 'cancelled', 'expired']);
      expect(readback.idempotencyRecords.filter((record) => record.operation === pmsReservationDraftCreateOperation)).toHaveLength(2);
      expect(readback.reservations).toEqual([]);
      expect(readback.operationRequests).toEqual([]);
      expect(readback.audits).toEqual([]);
      expect(readback.domainEvents).toEqual([]);
      store.close();
  
      const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
      expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, status: 'cancelled' })]));
      restarted.close();
    });
  
    
  
  it('persists reservation quote and prepareConfirm refs without final PMS mutations', () => {
      const dbPath = tempPath('reservation-draft-quote-prepare.sqlite');
      const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom], resetOnStart: true, now: () => now });
      const baseCreate: ReservationDraftCreateApiRequest = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'draft-sqlite-quote-create-1',
        requestFingerprint: 'sha256:draft-sqlite-quote-create-1',
        correlationId: 'corr-draft-sqlite-quote-create-1',
        requestedAt: now,
        slots: { guestDisplayName: 'Quote Guest', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-quote-1:room-1001' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-quote-1', generatedAt: now }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const created = store.createReservationDraft(baseCreate);
      const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
      const quoteRequest: ReservationQuoteApiRequest = {
        ...baseCreate,
        operation: pmsReservationQuoteOperation,
        clientToken: 'draft-sqlite-quote-1',
        requestFingerprint: 'sha256:draft-sqlite-quote-1',
        correlationId: 'corr-draft-sqlite-quote-1',
        requestedAt: '2026-04-28T00:05:00.000Z',
        draftRef,
      };
      const quoted = store.quoteReservationDraft(quoteRequest);
      const replayedQuote = store.quoteReservationDraft(quoteRequest);
      const quoteMismatch = store.quoteReservationDraft({ ...quoteRequest, requestFingerprint: 'sha256:draft-sqlite-quote-1-different' });
      const quoteRef = quoted.ok ? quoted.draft.quote!.quoteRef : 'missing-quote';
      const prepareRequest: ReservationPrepareConfirmApiRequest = {
        ...baseCreate,
        operation: pmsReservationPrepareConfirmOperation,
        clientToken: 'draft-sqlite-prepare-1',
        requestFingerprint: 'sha256:draft-sqlite-prepare-1',
        correlationId: 'corr-draft-sqlite-prepare-1',
        requestedAt: '2026-04-28T00:10:00.000Z',
        draftRef,
        quoteRef,
      };
      const prepared = store.prepareConfirmReservationDraft(prepareRequest);
      const replayedPrepare = store.prepareConfirmReservationDraft(prepareRequest);
      const prepareMismatch = store.prepareConfirmReservationDraft({ ...prepareRequest, requestFingerprint: 'sha256:draft-sqlite-prepare-1-different' });
      if (prepared.ok) {
        expect(quoteRef).toMatch(/^quote-[a-f0-9]{16}$/);
        expect(prepared.draft.pendingAction?.pendingActionRef).toMatch(/^pending-action-[a-f0-9]{16}$/);
        expect(prepared.draft.pendingAction?.cardPayloadRef).toMatch(/^card-payload-[a-f0-9]{16}$/);
      }
  
      const missingSlots = store.createReservationDraft({
        ...baseCreate,
        clientToken: 'draft-sqlite-quote-missing-create-1',
        requestFingerprint: 'sha256:draft-sqlite-quote-missing-create-1',
        slots: { guestDisplayName: 'Missing Slots' },
      });
      const missingSlotsQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-missing-1', requestFingerprint: 'sha256:draft-sqlite-quote-missing-1', draftRef: missingSlots.ok ? missingSlots.draft.draftRef : 'missing' });
      const expired = store.createReservationDraft({
        ...baseCreate,
        clientToken: 'draft-sqlite-quote-expired-create-1',
        requestFingerprint: 'sha256:draft-sqlite-quote-expired-create-1',
        requestedAt: '2026-04-30T00:00:00.000Z',
        expiresAt: '2026-04-29T00:00:00.000Z',
      });
      const expiredQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-expired-1', requestFingerprint: 'sha256:draft-sqlite-quote-expired-1', draftRef: expired.ok ? expired.draft.draftRef : 'missing' });
      const cancelTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'draft-sqlite-quote-cancel-create-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancel-create-1' });
      const cancelDraftRef = cancelTarget.ok ? cancelTarget.draft.draftRef! : 'missing';
      store.cancelReservationDraft({ ...baseCreate, operation: pmsReservationDraftCancelOperation, clientToken: 'draft-sqlite-quote-cancel-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancel-1', draftRef: cancelDraftRef, reason: 'test cancel' });
      const cancelledQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-cancelled-1', requestFingerprint: 'sha256:draft-sqlite-quote-cancelled-1', draftRef: cancelDraftRef });
      const notFoundQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-quote-not-found-1', requestFingerprint: 'sha256:draft-sqlite-quote-not-found-1', draftRef: '0000000000000000' });
  
      const staleTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'draft-sqlite-stale-quote-create-1', requestFingerprint: 'sha256:draft-sqlite-stale-quote-create-1' });
      const staleDraftRef = staleTarget.ok ? staleTarget.draft.draftRef! : 'missing';
      const staleQuote = store.quoteReservationDraft({ ...quoteRequest, clientToken: 'draft-sqlite-stale-quote-1', requestFingerprint: 'sha256:draft-sqlite-stale-quote-1', draftRef: staleDraftRef });
      const staleQuoteRef = staleQuote.ok ? staleQuote.draft.quote!.quoteRef : 'missing-stale-quote';
      store.updateReservationDraft({
        ...baseCreate,
        operation: pmsReservationDraftUpdateOperation,
        clientToken: 'draft-sqlite-stale-update-1',
        requestFingerprint: 'sha256:draft-sqlite-stale-update-1',
        correlationId: 'corr-draft-sqlite-stale-update-1',
        requestedAt: '2026-04-28T00:08:00.000Z',
        draftRef: staleDraftRef,
        slots: { ...baseCreate.slots, roomId: 'room-1002', selectedCandidateRef: 'availability-quote-2:room-1002' },
      });
      const stalePrepare = store.prepareConfirmReservationDraft({
        ...prepareRequest,
        clientToken: 'draft-sqlite-stale-prepare-1',
        requestFingerprint: 'sha256:draft-sqlite-stale-prepare-1',
        draftRef: staleDraftRef,
        quoteRef: staleQuoteRef,
      });
  
      expect(quoted).toMatchObject({
        ok: true,
        operation: 'pms.reservation.quote',
        mutationStatus: 'draftOnly',
        idempotencyStatus: 'quoted',
        draft: { draftRef, status: 'quoteReady', quote: { status: 'pricingUnsupported', capabilityGap: { code: 'RESERVATION_QUOTE_PRICING_UNSUPPORTED' } } },
      });
      expect(replayedQuote).toEqual(quoted);
      expect(quoteMismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(prepared).toMatchObject({
        ok: true,
        operation: 'pms.reservation.prepare_confirm',
        mutationStatus: 'draftOnly',
        idempotencyStatus: 'prepared',
        draft: { draftRef, status: 'awaitingConfirmation', quote: { quoteRef }, pendingAction: { quoteRef, confirmationMode: 'typedCardOnly', mutationStatus: 'none' } }
      });
      for (const response of [created, quoted, prepared]) if (response.ok) expect(response.draft.draftId).toBeUndefined();
      expect(replayedPrepare).toEqual(prepared);
      expect(prepareMismatch).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(missingSlotsQuote).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_MISSING_REQUIRED_SLOTS' }] });
      expect(expiredQuote).toMatchObject({ ok: false, status: 'rejected', draft: { status: 'expired' }, errors: [{ code: 'RESERVATION_DRAFT_EXPIRED' }] });
      expect(cancelledQuote).toMatchObject({ ok: false, status: 'rejected', draft: { status: 'cancelled' }, errors: [{ code: 'RESERVATION_DRAFT_NOT_ACTIVE' }] });
      expect(notFoundQuote).toMatchObject({ ok: false, status: 'notFound', errors: [{ code: 'RESERVATION_DRAFT_NOT_FOUND' }] });
      expect(stalePrepare).toMatchObject({ ok: false, status: 'rejected', errors: [{ code: 'RESERVATION_DRAFT_QUOTE_REQUIRED' }] });
  
      const readback = store.readback('room-1001');
      expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ draftRef, status: 'awaitingConfirmation', quote: expect.objectContaining({ quoteRef }), pendingAction: expect.objectContaining({ quoteRef }) }),
      ]));
      expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(expect.arrayContaining(['created', 'quoted', 'prepared', 'cancelled']));
      expect(readback.reservations).toEqual([]);
      expect(readback.operationRequests).toEqual([]);
      expect(readback.audits).toEqual([]);
      expect(readback.domainEvents).toEqual([]);
      store.close();
  
      const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
      expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ draftRef, status: 'awaitingConfirmation', quote: expect.objectContaining({ quoteRef }), pendingAction: expect.objectContaining({ quoteRef }) }),
      ]));
      restarted.close();
    });
  
    
  
  it('persists reservation group draft workflow and materializes pending-action confirm', () => {
      const dbPath = tempPath('reservation-group-draft-workflow.sqlite');
      const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom, vacantCleanRoom], resetOnStart: true, now: () => now });
      const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
      const completeSlots = {
        guestDisplayName: 'Group Guest',
        arrivalDate: '2026-05-04',
        departureDate: '2026-05-05',
        roomTypeKeyword: '花园',
        quantity: 2,
        selections: [
          { roomId: 'room-1001', selectedCandidateRef: 'availability-group-sqlite-1:room-1001', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅' },
          { roomId: 'room-A2', selectedCandidateRef: 'availability-group-sqlite-1:room-A2', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅' },
        ],
      };
      const baseCreate: ReservationGroupDraftCreateApiRequest = {
        operation: pmsReservationGroupDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'group-draft-sqlite-create-1',
        requestFingerprint: 'sha256:group-draft-sqlite-create-1',
        correlationId: 'corr-group-draft-sqlite-create-1',
        requestedAt: now,
        slots: { ...completeSlots, selections: undefined },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-group-sqlite-1', generatedAt: now }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const created = store.createReservationGroupDraft(baseCreate);
      const replayedCreate = store.createReservationGroupDraft(baseCreate);
      const createMismatch = store.createReservationGroupDraft({ ...baseCreate, requestFingerprint: 'sha256:group-draft-sqlite-create-1-different' });
      const groupDraftRef = created.ok ? created.groupDraft.groupDraftRef! : 'missing-group-draft';
      const update = store.updateReservationGroupDraft({
        ...baseCreate,
        operation: pmsReservationGroupDraftUpdateOperation,
        clientToken: 'group-draft-sqlite-update-1',
        requestFingerprint: 'sha256:group-draft-sqlite-update-1',
        correlationId: 'corr-group-draft-sqlite-update-1',
        requestedAt: '2026-04-28T00:01:00.000Z',
        groupDraftRef,
        slots: completeSlots,
      });
      const quote = store.quoteReservationGroupDraft({
        ...baseCreate,
        operation: pmsReservationGroupQuoteOperation,
        clientToken: 'group-draft-sqlite-quote-1',
        requestFingerprint: 'sha256:group-draft-sqlite-quote-1',
        correlationId: 'corr-group-draft-sqlite-quote-1',
        requestedAt: '2026-04-28T00:02:00.000Z',
        groupDraftRef,
      });
      const quoteRef = quote.ok ? quote.groupDraft.quote!.quoteRef : 'missing-group-quote';
      const prepared = store.prepareConfirmReservationGroupDraft({
        ...baseCreate,
        operation: pmsReservationGroupPrepareConfirmOperation,
        clientToken: 'group-draft-sqlite-prepare-1',
        requestFingerprint: 'sha256:group-draft-sqlite-prepare-1',
        correlationId: 'corr-group-draft-sqlite-prepare-1',
        requestedAt: '2026-04-28T00:03:00.000Z',
        groupDraftRef,
        quoteRef,
      });
      const pendingActionRef = prepared.ok ? prepared.groupDraft.pendingAction!.pendingActionRef : 'missing-group-pending';
      const cardPayloadRef = prepared.ok ? prepared.groupDraft.pendingAction!.cardPayloadRef : 'missing-group-card';
      const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-group-callback-1' };
      const status = store.getPendingActionStatus({ operation: pmsPendingActionStatusOperation, pendingActionRef, actor, scope, clientToken: 'group-pending-sqlite-status-1', requestFingerprint: 'sha256:group-pending-sqlite-status-1', correlationId: 'corr-group-pending-sqlite-status-1', requestedAt: '2026-04-28T00:04:00.000Z', cardPayloadRef });
      const cardPayloadMismatch = store.confirmPendingAction({ operation: pmsPendingActionConfirmOperation, pendingActionRef, actor, scope, clientToken: 'group-pending-sqlite-card-mismatch-1', requestFingerprint: 'sha256:group-pending-sqlite-card-mismatch-1', correlationId: 'corr-group-pending-sqlite-card-mismatch-1', requestedAt: '2026-04-28T00:05:00.000Z', cardPayloadRef: 'card-payload-ref-tampered' });
      const confirmed = store.confirmPendingAction({ operation: pmsPendingActionConfirmOperation, pendingActionRef, actor, scope, clientToken: 'group-pending-sqlite-confirm-1', requestFingerprint: 'sha256:group-pending-sqlite-confirm-1', correlationId: 'corr-group-pending-sqlite-confirm-1', requestedAt: '2026-04-28T00:06:00.000Z', cardPayloadRef });
      const inactiveCancel = store.cancelPendingAction({ operation: pmsPendingActionCancelOperation, pendingActionRef, actor, scope, clientToken: 'group-pending-sqlite-inactive-cancel-1', requestFingerprint: 'sha256:group-pending-sqlite-inactive-cancel-1', correlationId: 'corr-group-pending-sqlite-inactive-cancel-1', requestedAt: '2026-04-28T00:07:00.000Z', cardPayloadRef, reason: 'too late' });
  
      const cancelTarget = store.createReservationGroupDraft({ ...baseCreate, clientToken: 'group-draft-sqlite-cancel-create-1', requestFingerprint: 'sha256:group-draft-sqlite-cancel-create-1', correlationId: 'corr-group-draft-sqlite-cancel-create-1', slots: completeSlots });
      const cancelled = store.cancelReservationGroupDraft({ ...baseCreate, operation: pmsReservationGroupDraftCancelOperation, clientToken: 'group-draft-sqlite-cancel-1', requestFingerprint: 'sha256:group-draft-sqlite-cancel-1', correlationId: 'corr-group-draft-sqlite-cancel-1', requestedAt: '2026-04-28T00:08:00.000Z', groupDraftRef: cancelTarget.ok ? cancelTarget.groupDraft.groupDraftRef : 'missing-cancel-group', reason: 'guest cancelled group' });
  
      expect(created).toMatchObject({ ok: true, operation: 'pms.reservation.group_draft.create', mutationStatus: 'draftOnly', groupDraft: { groupDraftRef, status: 'collectingSlots', missingSlots: ['roomSelections'] } });
      expect(replayedCreate).toEqual(created);
      expect(createMismatch).toMatchObject({ ok: false, errors: [{ code: 'RESERVATION_GROUP_DRAFT_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(update).toMatchObject({ ok: true, operation: 'pms.reservation.group_draft.update', groupDraft: { groupDraftRef, status: 'quoteReady', missingSlots: [], slots: { selections: [{ roomId: 'room-1001' }, { roomId: 'room-A2' }] } } });
      expect(quote).toMatchObject({ ok: true, operation: 'pms.reservation.group_quote', groupDraft: { groupDraftRef, quote: { quoteRef, status: 'pricingUnsupported', capabilityGap: { code: 'RESERVATION_GROUP_QUOTE_PRICING_UNSUPPORTED' } } } });
      expect(prepared).toMatchObject({ ok: true, operation: 'pms.reservation.group_prepare_confirm', groupDraft: { groupDraftRef, status: 'awaitingConfirmation', pendingAction: { quoteRef, selectionCount: 2, confirmationMode: 'typedCardOnly', mutationStatus: 'none' } } });
      expect(status).toMatchObject({ ok: true, operation: 'pms.pending_action.status', pendingAction: { workflowType: 'reservationGroup', pendingActionRef, status: 'awaitingConfirmation' } });
      expect(cardPayloadMismatch).toMatchObject({ ok: false, pendingAction: { workflowType: 'reservationGroup', pendingActionRef, cardPayloadRef }, errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH' }] });
      expect(confirmed).toMatchObject({ ok: true, operation: 'pms.pending_action.confirm', mutationStatus: 'committed', pendingAction: { workflowType: 'reservationGroup', pendingActionRef, status: 'confirmed', mutationStatus: 'committed' } });
      expect(inactiveCancel).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE' }] });
      expect(cancelled).toMatchObject({ ok: true, operation: 'pms.reservation.group_draft.cancel', groupDraft: { status: 'cancelled' } });
  
      const readback = store.readback();
      expect(readback.reservationGroupDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ groupDraftRef, status: 'awaitingConfirmation', pendingAction: expect.objectContaining({ pendingActionRef, status: 'confirmed', selectionCount: 2 }) }),
      ]));
      expect(readback.reservationGroupDraftAudits.map((audit) => audit.action)).toEqual(expect.arrayContaining(['created', 'updated', 'quoted', 'prepared', 'pendingActionStatusRead', 'pendingActionConfirmed', 'cancelled']));
      expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'reservationGroupDraftAudit', projectionKind: 'reservationWorkflow', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
      ]));
      expect(JSON.stringify(readback.reservationGroupDraftAudits)).not.toContain(pendingActionRef);
      expect(readback.reservations).toEqual(expect.arrayContaining([
        expect.objectContaining({ reservationCode: expect.stringMatching(/^RG-/), roomId: 'room-1001', guestDisplayName: 'Group Guest', status: 'booked' }),
        expect.objectContaining({ reservationCode: expect.stringMatching(/^RG-/), roomId: 'room-A2', guestDisplayName: 'Group Guest', status: 'booked' }),
      ]));
      expect(readback.reservations).toHaveLength(2);
      expect(readback.reservationAllocations).toEqual(expect.arrayContaining([
        expect.objectContaining({ roomId: 'room-1001', status: 'allocated' }),
        expect.objectContaining({ roomId: 'room-A2', status: 'allocated' }),
      ]));
      expect(readback.operationRequests).toEqual([]);
      expect(readback.audits).toEqual([]);
      expect(readback.domainEvents).toEqual([]);
      store.close();
  
      const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
      expect(restarted.readback().reservationGroupDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ groupDraftRef, pendingAction: expect.objectContaining({ status: 'confirmed', selectionCount: 2 }) }),
      ]));
      restarted.close();
    });

  it('rejects reservation group pending-action confirm when a selected room became unavailable', () => {
      const dbPath = tempPath('reservation-group-confirm-conflict.sqlite');
      const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom, vacantCleanRoom], resetOnStart: true, now: () => now });
      const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
      const baseCreate: ReservationGroupDraftCreateApiRequest = {
        operation: pmsReservationGroupDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'group-conflict-create-1',
        requestFingerprint: 'sha256:group-conflict-create-1',
        correlationId: 'corr-group-conflict-create-1',
        requestedAt: now,
        slots: {
          guestDisplayName: 'Conflict Group',
          arrivalDate: '2026-05-04',
          departureDate: '2026-05-05',
          quantity: 2,
          selections: [
            { roomId: 'room-1001', selectedCandidateRef: 'availability-conflict:room-1001', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅' },
            { roomId: 'room-A2', selectedCandidateRef: 'availability-conflict:room-A2', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅' },
          ],
        },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-conflict', generatedAt: now }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const created = store.createReservationGroupDraft(baseCreate);
      const groupDraftRef = created.ok ? created.groupDraft.groupDraftRef! : 'missing-group-draft';
      const quote = store.quoteReservationGroupDraft({ ...baseCreate, operation: pmsReservationGroupQuoteOperation, clientToken: 'group-conflict-quote-1', requestFingerprint: 'sha256:group-conflict-quote-1', correlationId: 'corr-group-conflict-quote-1', requestedAt: '2026-04-28T00:01:00.000Z', groupDraftRef });
      const prepared = store.prepareConfirmReservationGroupDraft({ ...baseCreate, operation: pmsReservationGroupPrepareConfirmOperation, clientToken: 'group-conflict-prepare-1', requestFingerprint: 'sha256:group-conflict-prepare-1', correlationId: 'corr-group-conflict-prepare-1', requestedAt: '2026-04-28T00:02:00.000Z', groupDraftRef, quoteRef: quote.ok ? quote.groupDraft.quote!.quoteRef : 'missing-quote' });
      const blockerCreate = store.createReservationDraft({
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor,
        source: 'api',
        clientToken: 'group-conflict-blocker-create-1',
        requestFingerprint: 'sha256:group-conflict-blocker-create-1',
        correlationId: 'corr-group-conflict-blocker-create-1',
        requestedAt: '2026-04-28T00:03:00.000Z',
        slots: { guestDisplayName: 'Blocker', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-blocker:room-1001' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-blocker', generatedAt: now }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      });
      const blockerQuote = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'group-conflict-blocker-quote-1', requestFingerprint: 'sha256:group-conflict-blocker-quote-1', correlationId: 'corr-group-conflict-blocker-quote-1', requestedAt: '2026-04-28T00:04:00.000Z', draftRef: blockerCreate.ok ? blockerCreate.draft.draftRef : 'missing-draft' });
      const blockerPrepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'group-conflict-blocker-prepare-1', requestFingerprint: 'sha256:group-conflict-blocker-prepare-1', correlationId: 'corr-group-conflict-blocker-prepare-1', requestedAt: '2026-04-28T00:05:00.000Z', draftRef: blockerCreate.ok ? blockerCreate.draft.draftRef : 'missing-draft', quoteRef: blockerQuote.ok ? blockerQuote.draft.quote!.quoteRef : 'missing-quote' });
      store.confirmPendingAction({
        operation: pmsPendingActionConfirmOperation,
        pendingActionRef: blockerPrepared.ok ? blockerPrepared.draft.pendingAction!.pendingActionRef : 'missing-pending',
        actor,
        scope: { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-blocker' },
        clientToken: 'group-conflict-blocker-confirm-1',
        requestFingerprint: 'sha256:group-conflict-blocker-confirm-1',
        correlationId: 'corr-group-conflict-blocker-confirm-1',
        requestedAt: '2026-04-28T00:06:00.000Z',
        cardPayloadRef: blockerPrepared.ok ? blockerPrepared.draft.pendingAction!.cardPayloadRef : 'missing-card',
      });

      const rejected = store.confirmPendingAction({
        operation: pmsPendingActionConfirmOperation,
        pendingActionRef: prepared.ok ? prepared.groupDraft.pendingAction!.pendingActionRef : 'missing-pending',
        actor,
        scope: { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-group-conflict' },
        clientToken: 'group-conflict-confirm-1',
        requestFingerprint: 'sha256:group-conflict-confirm-1',
        correlationId: 'corr-group-conflict-confirm-1',
        requestedAt: '2026-04-28T00:07:00.000Z',
        cardPayloadRef: prepared.ok ? prepared.groupDraft.pendingAction!.cardPayloadRef : 'missing-card',
      });

      expect(rejected).toMatchObject({ ok: false, status: 'rejected', mutationStatus: 'none', errors: [{ code: 'RESERVATION_ROOM_UNAVAILABLE', field: 'roomSelections' }] });
      expect(store.readback().reservations).toHaveLength(1);
      store.close();
    });
  
    
  
  it('persists platform pending-action status, materializes single-room confirm, and keeps replay/conflict/expiry safe', () => {
      const dbPath = tempPath('pending-action-callback.sqlite');
      const store = createSqliteLocalSandboxStore({ dbPath, seedRooms: [dueOutRoom], resetOnStart: true, now: () => now });
      const baseCreate: ReservationDraftCreateApiRequest = {
        operation: pmsReservationDraftCreateOperation,
        propertyId: 'property-small-hotel',
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        source: 'api',
        clientToken: 'pending-sqlite-create-1',
        requestFingerprint: 'sha256:pending-sqlite-create-1',
        correlationId: 'corr-pending-sqlite-create-1',
        requestedAt: now,
        slots: { guestDisplayName: 'Pending Guest', arrivalDate: '2026-05-04', departureDate: '2026-05-05', roomId: 'room-1001', selectedCandidateRef: 'availability-pending-sqlite-1:room-1001' },
        evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-pending-sqlite-1', generatedAt: now }],
        expiresAt: '2026-05-03T00:00:00.000Z',
      };
      const created = store.createReservationDraft(baseCreate);
      const draftRef = created.ok ? created.draft.draftRef! : 'missing-draft';
      const quoted = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-quote-1', requestFingerprint: 'sha256:pending-sqlite-quote-1', correlationId: 'corr-pending-sqlite-quote-1', draftRef });
      const quoteRef = quoted.ok ? quoted.draft.quote!.quoteRef : 'missing-quote';
      const prepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-prepare-1', requestFingerprint: 'sha256:pending-sqlite-prepare-1', correlationId: 'corr-pending-sqlite-prepare-1', draftRef, quoteRef });
      const pendingActionRef = prepared.ok ? prepared.draft.pendingAction!.pendingActionRef : 'missing-pending';
      const cardPayloadRef = prepared.ok ? prepared.draft.pendingAction!.cardPayloadRef : 'missing-card';
      const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:user-callback-1' };
      const status = store.getPendingActionStatus({ operation: pmsPendingActionStatusOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-status-1', requestFingerprint: 'sha256:pending-sqlite-status-1', correlationId: 'corr-pending-sqlite-status-1', requestedAt: '2026-04-28T00:11:00.000Z', cardPayloadRef });
      const confirmRequest = { operation: pmsPendingActionConfirmOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-confirm-1', requestFingerprint: 'sha256:pending-sqlite-confirm-1', correlationId: 'corr-pending-sqlite-confirm-1', requestedAt: '2026-04-28T00:12:00.000Z', cardPayloadRef } as const;
      const cardPayloadMismatch = store.confirmPendingAction({ ...confirmRequest, clientToken: 'pending-sqlite-card-mismatch-1', requestFingerprint: 'sha256:pending-sqlite-card-mismatch-1', cardPayloadRef: 'card-payload-ref-tampered' });
      const confirmed = store.confirmPendingAction(confirmRequest);
      const replayedConfirm = store.confirmPendingAction(confirmRequest);
      const confirmMismatch = store.confirmPendingAction({ ...confirmRequest, requestFingerprint: 'sha256:pending-sqlite-confirm-different' });
      const wrongOperationToken = store.getPendingActionStatus({ operation: pmsPendingActionStatusOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: baseCreate.clientToken, requestFingerprint: baseCreate.requestFingerprint, correlationId: 'corr-pending-sqlite-status-wrong-op-1', requestedAt: '2026-04-28T00:12:30.000Z', cardPayloadRef });
      const inactiveCancel = store.cancelPendingAction({ operation: pmsPendingActionCancelOperation, pendingActionRef, actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-inactive-cancel-1', requestFingerprint: 'sha256:pending-sqlite-inactive-cancel-1', correlationId: 'corr-pending-sqlite-inactive-cancel-1', requestedAt: '2026-04-28T00:13:00.000Z', cardPayloadRef, reason: 'too late' });
  
      const cancelTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'pending-sqlite-cancel-create-1', requestFingerprint: 'sha256:pending-sqlite-cancel-create-1', correlationId: 'corr-pending-sqlite-cancel-create-1' });
      const cancelDraftRef = cancelTarget.ok ? cancelTarget.draft.draftRef! : 'missing-cancel-draft';
      const cancelQuote = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-cancel-quote-1', requestFingerprint: 'sha256:pending-sqlite-cancel-quote-1', correlationId: 'corr-pending-sqlite-cancel-quote-1', draftRef: cancelDraftRef });
      const cancelPrepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-cancel-prepare-1', requestFingerprint: 'sha256:pending-sqlite-cancel-prepare-1', correlationId: 'corr-pending-sqlite-cancel-prepare-1', draftRef: cancelDraftRef, quoteRef: cancelQuote.ok ? cancelQuote.draft.quote!.quoteRef : 'missing-cancel-quote' });
      const cancelled = store.cancelPendingAction({ operation: pmsPendingActionCancelOperation, pendingActionRef: cancelPrepared.ok ? cancelPrepared.draft.pendingAction!.pendingActionRef : 'missing-cancel-pending', actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-cancel-1', requestFingerprint: 'sha256:pending-sqlite-cancel-1', correlationId: 'corr-pending-sqlite-cancel-1', requestedAt: '2026-04-28T00:14:00.000Z', cardPayloadRef: cancelPrepared.ok ? cancelPrepared.draft.pendingAction!.cardPayloadRef : 'missing-cancel-card', reason: 'guest cancelled card' });
  
      const expiredTarget = store.createReservationDraft({ ...baseCreate, clientToken: 'pending-sqlite-expire-create-1', requestFingerprint: 'sha256:pending-sqlite-expire-create-1', correlationId: 'corr-pending-sqlite-expire-create-1', expiresAt: '2026-04-28T00:10:00.000Z' });
      const expiredDraftRef = expiredTarget.ok ? expiredTarget.draft.draftRef! : 'missing-expired-draft';
      const expiredQuote = store.quoteReservationDraft({ ...baseCreate, operation: pmsReservationQuoteOperation, clientToken: 'pending-sqlite-expire-quote-1', requestFingerprint: 'sha256:pending-sqlite-expire-quote-1', correlationId: 'corr-pending-sqlite-expire-quote-1', requestedAt: '2026-04-28T00:01:00.000Z', draftRef: expiredDraftRef });
      const expiredPrepared = store.prepareConfirmReservationDraft({ ...baseCreate, operation: pmsReservationPrepareConfirmOperation, clientToken: 'pending-sqlite-expire-prepare-1', requestFingerprint: 'sha256:pending-sqlite-expire-prepare-1', correlationId: 'corr-pending-sqlite-expire-prepare-1', requestedAt: '2026-04-28T00:02:00.000Z', draftRef: expiredDraftRef, quoteRef: expiredQuote.ok ? expiredQuote.draft.quote!.quoteRef : 'missing-expire-quote' });
      const expired = store.confirmPendingAction({ operation: pmsPendingActionConfirmOperation, pendingActionRef: expiredPrepared.ok ? expiredPrepared.draft.pendingAction!.pendingActionRef : 'missing-expired-pending', actor: baseCreate.actor, scope, clientToken: 'pending-sqlite-expired-confirm-1', requestFingerprint: 'sha256:pending-sqlite-expired-confirm-1', correlationId: 'corr-pending-sqlite-expired-confirm-1', requestedAt: '2026-04-28T00:15:00.000Z', cardPayloadRef: expiredPrepared.ok ? expiredPrepared.draft.pendingAction!.cardPayloadRef : 'missing-expired-card' });
  
      expect(status).toMatchObject({ ok: true, operation: 'pms.pending_action.status', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation' } });
      expect(cardPayloadMismatch).toMatchObject({ ok: false, operation: 'pms.pending_action.confirm', mutationStatus: 'none', pendingAction: { pendingActionRef, status: 'awaitingConfirmation', cardPayloadRef }, errors: [{ code: 'PENDING_ACTION_CARD_PAYLOAD_MISMATCH', field: 'cardPayloadRef' }] });
      expect(confirmed).toMatchObject({
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
      expect(replayedConfirm).toEqual(confirmed);
      expect(confirmMismatch).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(wrongOperationToken).toMatchObject({ ok: false, operation: 'pms.pending_action.status', errors: [{ code: 'PENDING_ACTION_TOKEN_REUSED_WITH_DIFFERENT_FINGERPRINT' }] });
      expect(inactiveCancel).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE' }] });
      expect(cancelled).toMatchObject({ ok: true, operation: 'pms.pending_action.cancel', mutationStatus: 'none', pendingAction: { status: 'cancelled' } });
      expect(expired).toMatchObject({ ok: false, errors: [{ code: 'PENDING_ACTION_EXPIRED' }], pendingAction: { status: 'expired' } });
  
      const readback = store.readback('room-1001');
      expect(readback.reservationDrafts).toEqual(expect.arrayContaining([
        expect.objectContaining({ draftRef, status: 'awaitingConfirmation', pendingAction: expect.objectContaining({ pendingActionRef, status: 'confirmed', mutationStatus: 'committed' }) }),
        expect.objectContaining({ draftRef: cancelDraftRef, status: 'cancelled', pendingAction: expect.objectContaining({ status: 'cancelled' }) }),
        expect.objectContaining({ draftRef: expiredDraftRef, status: 'expired', pendingAction: expect.objectContaining({ status: 'expired' }) }),
      ]));
      expect(readback.reservationDraftAudits.map((audit) => audit.action)).toEqual(expect.arrayContaining(['pendingActionStatusRead', 'pendingActionConfirmed', 'pendingActionCancelled', 'pendingActionExpired']));
      const exposedAuditSurface = JSON.stringify(readback.reservationDraftAudits);
      expect(exposedAuditSurface).not.toContain(pendingActionRef);
      expect(exposedAuditSurface).not.toContain(cardPayloadRef);
      expect(exposedAuditSurface).not.toContain(confirmRequest.clientToken);
      expect(exposedAuditSurface).not.toContain(baseCreate.actor.id);
      expect(readback.idempotencyRecords).toEqual(expect.arrayContaining([
        expect.objectContaining({ operation: pmsPendingActionStatusOperation, mode: 'confirm', ok: true }),
        expect.objectContaining({ operation: pmsPendingActionConfirmOperation, mode: 'confirm', ok: true }),
        expect.objectContaining({ operation: pmsPendingActionCancelOperation, mode: 'confirm', ok: true }),
      ]));
      expect(readback.projectionOutbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceType: 'reservationDraftAudit', projectionKind: 'reservationWorkflow', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
        expect.objectContaining({ sourceType: 'reservation', projectionKind: 'reservation', status: 'pending', deliveryOwner: 'adapter', truthOwner: 'pms-platform' }),
      ]));
      const exposedOutboxSurface = JSON.stringify(readback.projectionOutbox);
      expect(exposedOutboxSurface).not.toContain(pendingActionRef);
      expect(exposedOutboxSurface).not.toContain(cardPayloadRef);
      expect(exposedOutboxSurface).not.toContain(confirmRequest.clientToken);
      expect(readback.reservations).toEqual([
        expect.objectContaining({
          reservationCode: confirmed.ok ? confirmed.reservation?.reservationCode : 'missing-reservation',
          roomId: 'room-1001',
          roomNumber: '1001',
          guestDisplayName: 'Pending Guest',
          status: 'booked'
        })
      ]);
      expect(readback.operationRequests).toEqual([]);
      expect(readback.audits).toEqual([]);
      expect(readback.domainEvents).toEqual([]);
      store.close();
  
      const restarted = createSqliteLocalSandboxStore({ dbPath, seedRooms: [], resetOnStart: false, now: () => now });
      expect(restarted.readback().reservationDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ draftRef, pendingAction: expect.objectContaining({ status: 'confirmed' }) })]));
      restarted.close();
    });
  
    
});

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-sqlite-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

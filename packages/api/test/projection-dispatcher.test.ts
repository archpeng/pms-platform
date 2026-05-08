import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dispatchProjectionOutboxOnce,
  mapProjectionDispatchWorkItem,
} from '../src/projectionDispatcher.js';
import {
  pmsCheckOutOperation,
  pmsOperationRequestCreateOperation,
  pmsOperationRequestUpdateOperation,
  pmsPendingActionConfirmOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationGroupDraftUpdateOperation,
  type ReservationDraftCreateApiRequest,
  type ReservationGroupDraftCreateApiRequest,
} from '../src/index.js';
import { createSqliteLocalSandboxStore } from '../src/sqliteSandboxStore.js';
import type { RoomAggregate } from '@pms-platform/core';

const now = '2026-05-07T01:00:00.000Z';
const tmpRoots: string[] = [];

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe('projection dispatcher', () => {
  it('maps confirmed reservation group workflow outbox to adapter operation request upsert', async () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('projection-dispatch.sqlite'),
      seedRooms: [room('room-1001', '1001'), room('room-A2', 'A2')],
      resetOnStart: true,
      now: () => now,
    });
    const { pendingActionRef, cardPayloadRef } = createConfirmedGroupDraft(store);
    const bodies: unknown[] = [];

    const summary = await dispatchProjectionOutboxOnce({
      store,
      adapterBaseUrl: 'http://adapter.local',
      adapterToken: 'secret-token',
      batchSize: 100,
      now: () => '2026-05-07T01:10:00.000Z',
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ code: 0, status: 'updated' }), { status: 200 });
      },
    });

    expect(summary).toMatchObject({ failed: 0, retryable: 0 });
    const workflowBodies = bodies.filter((body) =>
      JSON.stringify(body).includes('reservationGroup workflow')
    ) as Array<{ fields: Record<string, unknown> }>;
    expect(workflowBodies.map((body) => body.fields.status)).toEqual([
      '处理中',
      '处理中',
      '处理中',
      '待确认',
      '已完成',
    ]);
    const confirmedBody = bodies.find((body) =>
      JSON.stringify(body).includes('pendingActionConfirmed')
    ) as { operation: string; clientToken: string; fields: Record<string, unknown> } | undefined;
    expect(confirmedBody).toMatchObject({
      operation: 'pms_base_upsert_operation_request',
      clientToken: expect.stringContaining('reservation-workflow:reservationGroup:'),
      fields: {
        action: 'RESERVATION_GROUP_WORKFLOW',
        status: '已完成',
        roomNumber: '1001,A2',
        operator: 'pms-platform',
        reason: 'reservationGroup workflow pendingActionConfirmed',
        schemaVersion: 'pms-dashboard-mvp-v1',
      },
    });
    expect(String(confirmedBody?.fields.payloadJSON)).toContain('"quantity":2');
    expect(String(confirmedBody?.fields.payloadJSON)).toContain('"roomNumber":"1001"');
    expect(String(confirmedBody?.fields.payloadJSON)).toContain('"pricingUnsupported":true');
    expect(JSON.stringify(confirmedBody)).not.toContain(pendingActionRef);
    expect(JSON.stringify(confirmedBody)).not.toContain(cardPayloadRef);
    expect(store.listProjectionDispatchWork({ now: '2026-05-07T01:11:00.000Z', limit: 100 })).toHaveLength(0);
    store.close();
  });

  it('maps committed single-room reservation outbox to adapter reservation projection upsert', async () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('projection-dispatch-reservation.sqlite'),
      seedRooms: [room('room-1001', '1001')],
      resetOnStart: true,
      now: () => now,
    });
    const reservationCode = createConfirmedSingleRoomDraft(store);

    const item = store.listProjectionDispatchWork({ now: '2026-05-07T01:12:00.000Z', limit: 100 })
      .find((candidate) => candidate.entry.projectionKind === 'reservation');

    expect(item).toBeDefined();
    expect(mapProjectionDispatchWorkItem(item!, '2026-05-07T01:12:00.000Z')).toMatchObject({
      operation: 'pms_base_upsert_reservation_projection',
      reservationCode,
      fields: {
        backendId: expect.any(String),
        reservationCode,
        roomNumber: '1001',
        guestLabel: 'Single Guest',
        arrivalDate: '2026-05-08',
        departureDate: '2026-05-10',
        status: 'Booked',
        schemaVersion: 'pms-dashboard-mvp-v1',
      },
    });
    store.close();
  });

  it('skips dry-run outbox entries without calling adapter', async () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('projection-dispatch-dry-run.sqlite'),
      seedRooms: [room('room-1001', '1001')],
      resetOnStart: true,
      now: () => now,
    });
    store.apiIdempotency.save({
      idempotencyKey: 'dry-run-key',
      requestFingerprint: 'sha256:dry-run-key',
      response: {
        ok: true,
        operation: pmsCheckOutOperation,
        mode: 'dryRun',
        room: room('room-1001', '1001'),
        plan: {
          commandType: 'CHECK_OUT',
          currentStatus: { occupancy: 'dueOut', cleaning: 'clean', sale: 'sellable' },
          nextStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
          housekeepingTask: { status: 'pending', kind: 'checkout-cleaning', roomId: 'room-1001', reason: 'dry run', correlationId: 'corr-dry-run' },
          domainEvents: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
          auditRequired: true,
        },
        request: { fingerprintInput: { operation: pmsCheckOutOperation, mode: 'dryRun', roomId: 'room-1001' } },
      } as never,
    });
    let called = false;

    const summary = await dispatchProjectionOutboxOnce({
      store,
      adapterBaseUrl: 'http://adapter.local',
      adapterToken: 'secret-token',
      now: () => '2026-05-07T01:20:00.000Z',
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      },
    });

    expect(summary).toEqual({ attempted: 0, delivered: 0, retryable: 0, failed: 0, skipped: 0 });
    expect(called).toBe(false);
    expect(store.listProjectionDispatchWork({ now: '2026-05-07T01:21:00.000Z' })).toHaveLength(0);
    store.close();
  });

  it('maps operation request status to adapter PMS Base values', () => {
    const store = createSqliteLocalSandboxStore({
      dbPath: tempPath('projection-dispatch-operation-request.sqlite'),
      seedRooms: [room('room-1001', '1001')],
      resetOnStart: true,
      now: () => now,
    });
    store.createOperationRequest({
      operation: pmsOperationRequestCreateOperation,
      propertyId: 'property-small-hotel',
      clientToken: 'operation-request-token-1',
      requestFingerprint: 'sha256:operation-request-token-1',
      source: 'api',
      action: 'RESERVATION_GROUP_WORKFLOW',
      roomId: 'room-1001',
      roomNumber: '1001',
      payload: { actor: { displayName: 'Ops' }, reason: 'group reservation confirmed' },
      requestedAt: now,
    });
    store.updateOperationRequest({
      operation: pmsOperationRequestUpdateOperation,
      clientToken: 'operation-request-token-1',
      status: 'completed',
      result: { ok: true },
      updatedAt: '2026-05-07T01:01:00.000Z',
    });

    const item = store.listProjectionDispatchWork({ now: '2026-05-07T01:02:00.000Z', limit: 10 })
      .find((candidate) => candidate.entry.projectionKind === 'operationRequestStatus');
    expect(item).toBeDefined();
    expect(mapProjectionDispatchWorkItem(item!, '2026-05-07T01:02:00.000Z')).toMatchObject({
      operation: 'pms_base_upsert_operation_request',
      clientToken: 'operation-request-token-1',
      fields: {
        action: 'RESERVATION_GROUP_WORKFLOW',
        status: '已完成',
        roomNumber: '1001',
        operator: 'Ops',
      },
    });
    store.close();
  });
});

function createConfirmedGroupDraft(store: ReturnType<typeof createSqliteLocalSandboxStore>): { pendingActionRef: string; cardPayloadRef: string } {
  const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
  const baseCreate: ReservationGroupDraftCreateApiRequest = {
    operation: pmsReservationGroupDraftCreateOperation,
    propertyId: 'property-small-hotel',
    actor,
    source: 'api',
    clientToken: 'group-draft-create-1',
    requestFingerprint: 'sha256:group-draft-create-1',
    correlationId: 'corr-group-draft-create-1',
    requestedAt: now,
    slots: {
      guestDisplayName: 'Group Guest',
      arrivalDate: '2026-05-08',
      departureDate: '2026-05-10',
      quantity: 2,
    },
    evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-group-1', generatedAt: now }],
  };
  const created = store.createReservationGroupDraft(baseCreate);
  if (!created.ok) throw new Error('group_create_failed');
  const groupDraftRef = created.groupDraft.groupDraftRef!;
  const update = store.updateReservationGroupDraft({
    ...baseCreate,
    operation: pmsReservationGroupDraftUpdateOperation,
    clientToken: 'group-draft-update-1',
    requestFingerprint: 'sha256:group-draft-update-1',
    correlationId: 'corr-group-draft-update-1',
    requestedAt: '2026-05-07T01:01:00.000Z',
    groupDraftRef,
    slots: {
      ...baseCreate.slots,
      selections: [
        { roomId: 'room-1001', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅', selectedCandidateRef: 'candidate-1001' },
        { roomId: 'room-A2', roomTypeId: 'room-type-garden-villa', roomType: '花园别墅', selectedCandidateRef: 'candidate-A2' },
      ],
    },
    missingSlots: [],
  });
  if (!update.ok) throw new Error('group_update_failed');
  const quoted = store.quoteReservationGroupDraft({
    ...baseCreate,
    operation: pmsReservationGroupQuoteOperation,
    clientToken: 'group-draft-quote-1',
    requestFingerprint: 'sha256:group-draft-quote-1',
    correlationId: 'corr-group-draft-quote-1',
    requestedAt: '2026-05-07T01:02:00.000Z',
    groupDraftRef,
  });
  if (!quoted.ok) throw new Error('group_quote_failed');
  const prepared = store.prepareConfirmReservationGroupDraft({
    ...baseCreate,
    operation: pmsReservationGroupPrepareConfirmOperation,
    clientToken: 'group-draft-prepare-1',
    requestFingerprint: 'sha256:group-draft-prepare-1',
    correlationId: 'corr-group-draft-prepare-1',
    requestedAt: '2026-05-07T01:03:00.000Z',
    groupDraftRef,
    quoteRef: quoted.groupDraft.quote!.quoteRef,
  });
  if (!prepared.ok) throw new Error('group_prepare_failed');
  const pendingActionRef = prepared.groupDraft.pendingAction!.pendingActionRef;
  const cardPayloadRef = prepared.groupDraft.pendingAction!.cardPayloadRef;
  const confirmed = store.confirmPendingAction({
    operation: pmsPendingActionConfirmOperation,
    pendingActionRef,
    actor,
    scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-1' },
    clientToken: 'group-draft-confirm-1',
    requestFingerprint: 'sha256:group-draft-confirm-1',
    correlationId: 'corr-group-draft-confirm-1',
    requestedAt: '2026-05-07T01:04:00.000Z',
    cardPayloadRef,
  });
  if (!confirmed.ok) throw new Error('group_confirm_failed');
  return { pendingActionRef, cardPayloadRef };
}

function createConfirmedSingleRoomDraft(store: ReturnType<typeof createSqliteLocalSandboxStore>): string {
  const actor = { type: 'human' as const, id: 'frontdesk-1', displayName: 'Front Desk' };
  const baseCreate: ReservationDraftCreateApiRequest = {
    operation: pmsReservationDraftCreateOperation,
    propertyId: 'property-small-hotel',
    actor,
    source: 'api',
    clientToken: 'single-draft-create-1',
    requestFingerprint: 'sha256:single-draft-create-1',
    correlationId: 'corr-single-draft-create-1',
    requestedAt: now,
    slots: {
      guestDisplayName: 'Single Guest',
      arrivalDate: '2026-05-08',
      departureDate: '2026-05-10',
      roomId: 'room-1001',
      selectedCandidateRef: 'candidate-1001',
    },
    evidenceRefs: [{ source: 'availabilitySearch', refId: 'availability-single-1', generatedAt: now }],
  };
  const created = store.createReservationDraft(baseCreate);
  if (!created.ok) throw new Error('single_create_failed');
  const draftRef = created.draft.draftRef!;
  const quoted = store.quoteReservationDraft({
    ...baseCreate,
    operation: pmsReservationQuoteOperation,
    clientToken: 'single-draft-quote-1',
    requestFingerprint: 'sha256:single-draft-quote-1',
    correlationId: 'corr-single-draft-quote-1',
    requestedAt: '2026-05-07T01:01:00.000Z',
    draftRef,
  });
  if (!quoted.ok) throw new Error('single_quote_failed');
  const prepared = store.prepareConfirmReservationDraft({
    ...baseCreate,
    operation: pmsReservationPrepareConfirmOperation,
    clientToken: 'single-draft-prepare-1',
    requestFingerprint: 'sha256:single-draft-prepare-1',
    correlationId: 'corr-single-draft-prepare-1',
    requestedAt: '2026-05-07T01:02:00.000Z',
    draftRef,
    quoteRef: quoted.draft.quote!.quoteRef,
  });
  if (!prepared.ok) throw new Error('single_prepare_failed');
  const confirmed = store.confirmPendingAction({
    operation: pmsPendingActionConfirmOperation,
    pendingActionRef: prepared.draft.pendingAction!.pendingActionRef,
    actor,
    scope: { propertyId: 'property-small-hotel', channel: 'typed_card', userIdHash: 'sha256:user-1' },
    clientToken: 'single-draft-confirm-1',
    requestFingerprint: 'sha256:single-draft-confirm-1',
    correlationId: 'corr-single-draft-confirm-1',
    requestedAt: '2026-05-07T01:03:00.000Z',
    cardPayloadRef: prepared.draft.pendingAction!.cardPayloadRef,
  });
  if (!confirmed.ok || !confirmed.reservation) throw new Error('single_confirm_failed');
  return confirmed.reservation.reservationCode;
}

function room(roomId: string, roomNumber: string): RoomAggregate {
  return {
    roomId,
    roomNumber,
    propertyId: 'property-small-hotel',
    roomTypeId: 'room-type-garden-villa',
    roomType: '花园别墅',
    zone: roomNumber.slice(0, 1),
    sortKey: roomNumber,
    occupancyStatus: 'vacant',
    cleaningStatus: 'clean',
    saleStatus: 'sellable',
  };
}

function tempPath(fileName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pms-projection-dispatcher-'));
  tmpRoots.push(root);
  return join(root, fileName);
}

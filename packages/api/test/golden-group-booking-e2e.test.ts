import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoomAggregate } from '@pms-platform/core';
import {
  pmsAvailabilitySearchOperation,
  pmsPendingActionConfirmOperation,
  pmsReservationDraftCreateOperation,
  pmsReservationGroupDraftCreateOperation,
  pmsReservationGroupDraftUpdateOperation,
  pmsReservationGroupPrepareConfirmOperation,
  pmsReservationGroupQuoteOperation,
  pmsReservationPrepareConfirmOperation,
  pmsReservationQuoteOperation,
} from '../src/index.js';
import {
  startPmsLocalHttpServer,
  type StartedPmsLocalHttpServer,
} from '../src/localSandbox.js';
import { createSqliteLocalSandboxStore } from '../src/sqliteSandboxStore.js';

const authToken = 'golden-local-auth-token';
const goldenRooms: readonly RoomAggregate[] = [
  room('room-A1', 'A1'),
  room('room-A2', 'A2'),
];

const actor = { type: 'human' as const, id: 'frontdesk-golden', displayName: 'Front Desk' };
const scope = { propertyId: 'property-small-hotel', channel: 'typed_card' as const, userIdHash: 'sha256:golden-user' };
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

describe('golden PMS group-booking E2E', () => {
  it('materializes two confirmed card selections into reservations and allocations', async () => {
    const { url } = await startGoldenServer();
    const before = await authedGet(`${url}/v1/sandbox/readback`);
    const prepared = await prepareGoldenGroupBooking(url, 'happy');

    const confirmed = await confirmPendingAction(url, {
      pendingActionRef: prepared.pendingActionRef,
      cardPayloadRef: prepared.cardPayloadRef,
      clientToken: 'golden-group-confirm-happy',
      requestedAt: '2026-05-10T02:05:00.000Z',
    });
    const after = await authedGet(`${url}/v1/sandbox/readback`);
    const availabilityAfterConfirm = await authedPost(`${url}/v1/pms/availability/search`, {
      operation: pmsAvailabilitySearchOperation,
      startDate: '2026-05-12',
      endDate: '2026-05-14',
      roomTypeKeyword: '花园别墅',
      count: 2,
      requestedAt: '2026-05-10T02:06:00.000Z',
    });

    expect(confirmed).toMatchObject({
      ok: true,
      operation: 'pms.pending_action.confirm',
      mutationStatus: 'committed',
      pendingAction: {
        workflowType: 'reservationGroup',
        status: 'confirmed',
        mutationStatus: 'committed',
      },
    });
    expect(after.reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomId: 'room-A1', roomType: '花园别墅', guestDisplayName: '莉莉', arrivalDate: '2026-05-12', departureDate: '2026-05-14', status: 'booked' }),
      expect.objectContaining({ roomId: 'room-A2', roomType: '花园别墅', guestDisplayName: '莉莉', arrivalDate: '2026-05-12', departureDate: '2026-05-14', status: 'booked' }),
    ]));
    expect(after.reservations).toHaveLength(before.reservations.length + 2);
    expect(after.reservationAllocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomId: 'room-A1', roomType: '花园别墅', startDate: '2026-05-12', endDate: '2026-05-14', status: 'allocated' }),
      expect.objectContaining({ roomId: 'room-A2', roomType: '花园别墅', startDate: '2026-05-12', endDate: '2026-05-14', status: 'allocated' }),
    ]));
    expect(availabilityAfterConfirm).toMatchObject({
      ok: true,
      readModel: { candidateCount: 0, candidates: [] },
    });
    expect(JSON.stringify(confirmed)).not.toContain('deferred');
  });

  it('rejects the card confirm when one selected room was taken after card preparation', async () => {
    const { url } = await startGoldenServer();
    const prepared = await prepareGoldenGroupBooking(url, 'conflict');
    const blocker = await prepareSingleRoomBlocker(url);
    await confirmPendingAction(url, {
      pendingActionRef: blocker.pendingActionRef,
      cardPayloadRef: blocker.cardPayloadRef,
      clientToken: 'golden-single-blocker-confirm',
      requestedAt: '2026-05-10T03:06:00.000Z',
    });

    const rejected = await confirmPendingAction(url, {
      pendingActionRef: prepared.pendingActionRef,
      cardPayloadRef: prepared.cardPayloadRef,
      clientToken: 'golden-group-confirm-conflict',
      requestedAt: '2026-05-10T03:07:00.000Z',
    });
    const readback = await authedGet(`${url}/v1/sandbox/readback`);

    expect(rejected).toMatchObject({
      ok: false,
      status: 'rejected',
      mutationStatus: 'none',
      errors: [{ code: 'RESERVATION_ROOM_UNAVAILABLE', field: 'roomSelections' }],
    });
    expect(readback.reservations).toEqual([
      expect.objectContaining({ roomId: 'room-A1', guestDisplayName: 'Blocker Guest', status: 'booked' }),
    ]);
  });
});

async function prepareGoldenGroupBooking(url: string, token: string) {
  const availability = await authedPost(`${url}/v1/pms/availability/search`, {
    operation: pmsAvailabilitySearchOperation,
    startDate: '2026-05-12',
    endDate: '2026-05-14',
    roomTypeKeyword: '花园别墅',
    count: 2,
    requestedAt: `2026-05-10T02:00:00.000Z`,
  });
  expect(availability.readModel.candidateCount).toBe(2);

  const create = await authedPost(`${url}/v1/pms/reservation-group-drafts/create`, {
    ...groupRequestBase(token, 'create', '2026-05-10T02:01:00.000Z'),
    operation: pmsReservationGroupDraftCreateOperation,
    slots: { guestDisplayName: '莉莉', arrivalDate: '2026-05-12', departureDate: '2026-05-14', quantity: 2, roomTypeKeyword: '花园别墅' },
    evidenceRefs: [{ source: 'availabilitySearch', refId: `${availability.readModel.generatedAt}:group` }],
    expiresAt: '2026-05-11T02:00:00.000Z',
  });
  const groupDraftRef = create.groupDraft.groupDraftRef;
  const selections = availability.readModel.candidates.map((candidate: Record<string, unknown>) => ({
    roomId: candidate.roomId,
    selectedCandidateRef: `${availability.readModel.generatedAt}:${candidate.roomId}`,
    roomTypeId: candidate.roomTypeId,
    roomType: candidate.roomType,
  }));
  await authedPost(`${url}/v1/pms/reservation-group-drafts/update`, {
    ...groupRequestBase(token, 'update', '2026-05-10T02:02:00.000Z'),
    operation: pmsReservationGroupDraftUpdateOperation,
    groupDraftRef,
    slots: { selections },
    evidenceRefs: [{ source: 'availabilitySearch', refId: `${availability.readModel.generatedAt}:selected-group` }],
  });
  const quote = await authedPost(`${url}/v1/pms/reservation-group-drafts/quote`, {
    ...groupRequestBase(token, 'quote', '2026-05-10T02:03:00.000Z'),
    operation: pmsReservationGroupQuoteOperation,
    groupDraftRef,
  });
  const prepare = await authedPost(`${url}/v1/pms/reservation-group-drafts/prepare-confirm`, {
    ...groupRequestBase(token, 'prepare', '2026-05-10T02:04:00.000Z'),
    operation: pmsReservationGroupPrepareConfirmOperation,
    groupDraftRef,
    quoteRef: quote.groupDraft.quote.quoteRef,
  });
  return {
    pendingActionRef: prepare.groupDraft.pendingAction.pendingActionRef as string,
    cardPayloadRef: prepare.groupDraft.pendingAction.cardPayloadRef as string,
  };
}

async function prepareSingleRoomBlocker(url: string) {
  const create = await authedPost(`${url}/v1/pms/reservation-drafts/create`, {
    ...groupRequestBase('single-blocker', 'create', '2026-05-10T03:01:00.000Z'),
    operation: pmsReservationDraftCreateOperation,
    slots: { guestDisplayName: 'Blocker Guest', arrivalDate: '2026-05-12', departureDate: '2026-05-14', roomId: 'room-A1', selectedCandidateRef: 'golden-blocker:room-A1' },
    evidenceRefs: [{ source: 'availabilitySearch', refId: 'golden-blocker' }],
    expiresAt: '2026-05-11T03:00:00.000Z',
  });
  const quote = await authedPost(`${url}/v1/pms/reservation-drafts/quote`, {
    ...groupRequestBase('single-blocker', 'quote', '2026-05-10T03:02:00.000Z'),
    operation: pmsReservationQuoteOperation,
    draftRef: create.draft.draftRef,
  });
  const prepare = await authedPost(`${url}/v1/pms/reservation-drafts/prepare-confirm`, {
    ...groupRequestBase('single-blocker', 'prepare', '2026-05-10T03:03:00.000Z'),
    operation: pmsReservationPrepareConfirmOperation,
    draftRef: create.draft.draftRef,
    quoteRef: quote.draft.quote.quoteRef,
  });
  return {
    pendingActionRef: prepare.draft.pendingAction.pendingActionRef as string,
    cardPayloadRef: prepare.draft.pendingAction.cardPayloadRef as string,
  };
}

async function confirmPendingAction(url: string, input: { pendingActionRef: string; cardPayloadRef: string; clientToken: string; requestedAt: string }) {
  return authedPost(`${url}/v1/pms/pending-actions/confirm`, {
    operation: pmsPendingActionConfirmOperation,
    pendingActionRef: input.pendingActionRef,
    actor,
    scope,
    clientToken: input.clientToken,
    requestFingerprint: `sha256:${input.clientToken}`,
    correlationId: `corr-${input.clientToken}`,
    requestedAt: input.requestedAt,
    cardPayloadRef: input.cardPayloadRef,
  });
}

function groupRequestBase(token: string, step: string, requestedAt: string) {
  return {
    propertyId: 'property-small-hotel',
    actor,
    source: 'api',
    clientToken: `golden-${token}-${step}`,
    requestFingerprint: `sha256:golden-${token}-${step}`,
    correlationId: `corr-golden-${token}-${step}`,
    requestedAt,
  };
}

async function startGoldenServer() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'pms-golden-group-booking-'));
  tmpRoots.push(tmpRoot);
  const store = createSqliteLocalSandboxStore({
    dbPath: join(tmpRoot, 'pms.sqlite'),
    seedRooms: goldenRooms,
    resetOnStart: true,
  });
  const started = await startPmsLocalHttpServer({
    store,
    auth: { token: authToken, required: true },
  });
  servers.push(started);
  return started;
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

function room(roomId: string, roomNumber: string): RoomAggregate {
  return {
    roomId,
    roomNumber,
    propertyId: 'property-small-hotel',
    roomTypeId: 'room-type-garden-villa',
    roomType: '花园别墅',
    zone: 'A',
    sortKey: roomNumber,
    occupancyStatus: 'vacant',
    cleaningStatus: 'clean',
    saleStatus: 'sellable',
  };
}

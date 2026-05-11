import type { Actor } from './actor.js';
import type { CheckInCommand,CheckOutCommand } from './commands.js';
import type { DomainError } from './domain.js';
import type { RoomState } from './room.js';

export const smallHotelPropertyId = 'property-small-hotel';

export const smallHotelRoomNumbers = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'D3', 'D4', 'D5', 'E1', 'E2'] as const;

export const smallHotelRoomTypeByRoomNumber = {
  A1: '花园别墅',
  A2: '花园别墅',
  B1: '花园别墅',
  B2: '花园别墅',
  C1: '花园别墅',
  C2: '花园套房',
  D1: '秘境洞穴',
  D2: '秘境洞穴',
  D3: '秘境洞穴',
  D4: '秘境洞穴',
  D5: '秘境洞穴',
  E1: '花园套房',
  E2: '花园别墅',
} as const;

export const smallHotelRoomTypeIdByDisplayName = {
  花园别墅: 'room-type-garden-villa',
  秘境洞穴: 'room-type-cave',
  花园套房: 'room-type-garden-suite',
} as const;

export function roomTypeForSmallHotelRoomNumber(roomNumber: string, fallback = '房型待补全'): string {
  return smallHotelRoomTypeByRoomNumber[roomNumber as keyof typeof smallHotelRoomTypeByRoomNumber] ?? fallback;
}

export function roomTypeIdForSmallHotelRoomType(roomType: string, fallback = 'room-type-unknown'): string {
  return smallHotelRoomTypeIdByDisplayName[roomType as keyof typeof smallHotelRoomTypeIdByDisplayName] ?? fallback;
}

export const checkinContractFixtures = {
  actor: {
    type: 'human',
    id: 'user-frontdesk-1',
    displayName: 'Front Desk',
  } satisfies Actor,
  room: {
    roomId: 'room-1003',
    roomNumber: '1003',
    status: {
      occupancy: 'vacant',
      cleaning: 'clean',
      sale: 'sellable',
    },
  } satisfies RoomState,
  dryRunCommand: {
    type: 'CHECK_IN',
    roomId: 'room-1003',
    meta: {
      actor: {
        type: 'human',
        id: 'user-frontdesk-1',
        displayName: 'Front Desk',
      },
      source: 'api',
      reason: 'Guest arrived with verified reservation.',
      idempotencyKey: 'checkin-room-1003-2026-04-25',
      correlationId: 'corr-checkin-room-1003',
      requestedAt: '2026-04-25T01:00:00.000Z',
      mode: 'dryRun',
    },
  } satisfies CheckInCommand,
  stableFailure: {
    code: 'ROOM_NOT_CHECKIN_ELIGIBLE',
    message: 'Room is not eligible for check-in.',
    field: 'room.status',
  } satisfies DomainError,
} as const;

export const checkoutContractFixtures = {
  actor: {
    type: 'human',
    id: 'user-frontdesk-1',
    displayName: 'Front Desk',
  } satisfies Actor,
  room: {
    roomId: 'room-1001',
    roomNumber: '1001',
    status: {
      occupancy: 'dueOut',
      cleaning: 'clean',
      sale: 'sellable',
    },
  } satisfies RoomState,
  dryRunCommand: {
    type: 'CHECK_OUT',
    roomId: 'room-1001',
    meta: {
      actor: {
        type: 'human',
        id: 'user-frontdesk-1',
        displayName: 'Front Desk',
      },
      source: 'api',
      reason: 'Guest departed and returned room cards.',
      idempotencyKey: 'checkout-room-1001-2026-04-25',
      correlationId: 'corr-checkout-room-1001',
      requestedAt: '2026-04-25T00:00:00.000Z',
      mode: 'dryRun',
    },
  } satisfies CheckOutCommand,
  stableFailure: {
    code: 'MISSING_REASON',
    message: 'A reason is required for mutating PMS commands.',
    field: 'meta.reason',
  } satisfies DomainError,
} as const;

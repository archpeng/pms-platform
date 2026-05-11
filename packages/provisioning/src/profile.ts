import { roomTypeForSmallHotelRoomNumber,smallHotelRoomNumbers } from '@pms-platform/contracts';
import type { HotelProfile, HotelProfileCandidate, HotelRoomProfile, PmsBaseWorkflow } from './schema.js';

export const smallHotelProfileFixture: HotelProfile = {
  propertyKey: 'small-hotel-pms-base-cn',
  propertyName: '酒店房态管理',
  baseDisplayName: '酒店房态管理',
  timeZone: 'Asia/Shanghai',
  proofRoomNumbers: ['A1', 'A2'],
  enabledWorkflows: [
    'CHECK_IN',
    'CHECK_OUT',
    'HOUSEKEEPING_DONE',
    'HOUSEKEEPING_INSPECTION',
    'HOUSEKEEPING_REWORK',
    'REPORT_MAINTENANCE',
    'MAINTENANCE_DONE',
    'RESTORE_SELLABLE',
  ],
  operationRequestStrategy: 'adapterUpsert',
  dashboardFeatures: ['frontDeskDashboard', 'roomLedger', 'operationRequests', 'housekeepingQueue', 'maintenanceQueue', 'operationLogs'],
  rooms: smallHotelRoomNumbers.map((roomNumber) => ({
    roomNumber,
    roomType: roomTypeForSmallHotelRoomNumber(roomNumber, '花园别墅'),
    zone: roomNumber.slice(0, 1),
    initialStatus: {
      occupancyStatus: '空房',
      cleaningStatus: '干净',
      sellableStatus: '可售',
    },
  })),
};

export function parseHotelProfileCandidateFromText(text: string): HotelProfileCandidate {
  const roomNumbers = [...new Set([...text.matchAll(/\b\d{3,4}\b/g)].map((match) => match[0]))];
  const timeZone = text.match(/\b[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+\b/)?.[0];

  return {
    propertyKey: 'sandbox-pms-base-n5',
    propertyName: 'Sandbox PMS Base',
    baseDisplayName: 'Sandbox PMS Base - N5 Proof',
    timeZone,
    proofRoomNumbers: roomNumbers.slice(0, 2),
    enabledWorkflows: inferWorkflows(text),
    operationRequestStrategy: 'adapterUpsert',
    dashboardFeatures: smallHotelProfileFixture.dashboardFeatures,
    rooms: roomNumbers.slice(0, Math.max(2, roomNumbers.length)).map((roomNumber, index) => ({
      roomNumber,
      roomType: index === 0 ? '花园别墅' : '花园套房',
      zone: roomNumber.slice(0, 1),
      initialStatus: index === 0
        ? smallHotelProfileFixture.rooms[0].initialStatus
        : smallHotelProfileFixture.rooms[1].initialStatus,
    })),
  };
}

export function normalizeHotelProfileCandidate(candidate: HotelProfileCandidate): HotelProfile {
  const proofRoomNumbers = uniqueStrings(candidate.proofRoomNumbers ?? smallHotelProfileFixture.proofRoomNumbers);
  const candidateRooms = candidate.rooms ?? [];
  const rooms = uniqueRooms([
    ...candidateRooms.map((room, index) => normalizeRoomCandidate(room, index)),
    ...proofRoomNumbers.map((roomNumber, index) => normalizeRoomCandidate({ roomNumber }, index)),
  ]);

  return {
    propertyKey: normalizeRequiredString(candidate.propertyKey, smallHotelProfileFixture.propertyKey),
    propertyName: normalizeRequiredString(candidate.propertyName, smallHotelProfileFixture.propertyName),
    baseDisplayName: normalizeRequiredString(candidate.baseDisplayName, smallHotelProfileFixture.baseDisplayName),
    timeZone: normalizeRequiredString(candidate.timeZone, smallHotelProfileFixture.timeZone),
    proofRoomNumbers,
    enabledWorkflows: uniqueWorkflows(candidate.enabledWorkflows ?? smallHotelProfileFixture.enabledWorkflows),
    operationRequestStrategy: candidate.operationRequestStrategy ?? 'adapterUpsert',
    dashboardFeatures: uniqueStrings(candidate.dashboardFeatures ?? smallHotelProfileFixture.dashboardFeatures),
    rooms,
  };
}

function normalizeRoomCandidate(room: Partial<HotelRoomProfile>, index: number): HotelRoomProfile {
  const roomNumber = normalizeRequiredString(room.roomNumber, smallHotelProfileFixture.rooms[index]?.roomNumber ?? `10${index + 1}`);
  return {
    roomNumber,
    roomType: normalizeRequiredString(room.roomType, smallHotelProfileFixture.rooms[index]?.roomType ?? (index === 0 ? '花园别墅' : '花园套房')),
    zone: normalizeRequiredString(room.zone, roomNumber.slice(0, 1)),
    initialStatus: room.initialStatus ?? (index === 0 ? smallHotelProfileFixture.rooms[0].initialStatus : smallHotelProfileFixture.rooms[1].initialStatus),
  };
}

function inferWorkflows(text: string): readonly PmsBaseWorkflow[] {
  const normalized = text.toLowerCase();
  const workflows: PmsBaseWorkflow[] = [];
  if (normalized.includes('check-in') || normalized.includes('check in')) {
    workflows.push('CHECK_IN');
  }
  if (normalized.includes('check-out') || normalized.includes('check out')) {
    workflows.push('CHECK_OUT');
  }
  if (normalized.includes('housekeeping') || text.includes('保洁')) {
    workflows.push('HOUSEKEEPING_DONE', 'HOUSEKEEPING_INSPECTION', 'HOUSEKEEPING_REWORK');
  }
  if (normalized.includes('maintenance') || text.includes('维修') || text.includes('报修')) {
    workflows.push('REPORT_MAINTENANCE', 'MAINTENANCE_DONE', 'RESTORE_SELLABLE');
  }
  return workflows.length > 0 ? workflows : smallHotelProfileFixture.enabledWorkflows;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueWorkflows(values: readonly PmsBaseWorkflow[]): PmsBaseWorkflow[] {
  const allowed = new Set<PmsBaseWorkflow>([
    'CHECK_IN',
    'CHECK_OUT',
    'HOUSEKEEPING_DONE',
    'HOUSEKEEPING_INSPECTION',
    'HOUSEKEEPING_REWORK',
    'REPORT_MAINTENANCE',
    'MAINTENANCE_DONE',
    'RESTORE_SELLABLE',
  ]);
  return [...new Set(values)].filter((value): value is PmsBaseWorkflow => allowed.has(value));
}

function uniqueRooms(values: readonly HotelRoomProfile[]): HotelRoomProfile[] {
  const seen = new Set<string>();
  const rooms: HotelRoomProfile[] = [];
  for (const room of values) {
    if (!seen.has(room.roomNumber)) {
      seen.add(room.roomNumber);
      rooms.push(room);
    }
  }
  return rooms;
}

function normalizeRequiredString(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

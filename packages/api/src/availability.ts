import type {
  AvailabilityRoomCandidate,
  AvailabilitySearchReadModel,
  InventoryReadModel,
} from '@pms-platform/contracts';
import { pmsAvailabilitySearchOperation } from './operations.js';

export interface AvailabilitySearchApiRequest {
  readonly operation: typeof pmsAvailabilitySearchOperation;
  readonly startDate: string;
  readonly endDate?: string;
  readonly horizonDays?: number;
  readonly roomTypeId?: string;
  readonly roomTypeKeyword?: string;
  readonly capacity?: number;
  readonly count?: number;
  readonly requestedAt: string;
}

export interface AvailabilitySearchApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsAvailabilitySearchOperation;
  readonly readModel: AvailabilitySearchReadModel;
}

export function executeAvailabilitySearchApiRequest(
  request: AvailabilitySearchApiRequest,
  inventory: InventoryReadModel,
): AvailabilitySearchApiResponse {
  const requestedDates = dateRange(request.startDate, request.endDate ?? addBusinessDays(request.startDate, 1));
  const unsupportedFilters = request.capacity === undefined ? [] as const : ['capacity'] as const;
  const count = positiveIntegerOrUndefined(request.count);
  const candidates = unsupportedFilters.length > 0
    ? []
    : findAvailabilityCandidates(inventory, requestedDates, request).slice(0, count);

  return {
    ok: true,
    operation: pmsAvailabilitySearchOperation,
    readModel: {
      schemaVersion: inventory.schemaVersion,
      generatedAt: request.requestedAt,
      summaryStatus: inventory.summaryStatus,
      request: {
        startDate: request.startDate,
        endDate: request.endDate ?? addBusinessDays(request.startDate, 1),
        ...(request.roomTypeId ? { roomTypeId: request.roomTypeId } : {}),
        ...(request.roomTypeKeyword ? { roomTypeKeyword: request.roomTypeKeyword } : {}),
        ...(count ? { count } : {}),
        unsupportedFilters,
      },
      candidates,
      candidateCount: candidates.length,
      truncated: count !== undefined && findAvailabilityCandidates(inventory, requestedDates, request).length > candidates.length,
      projectionFreshness: inventory.projectionFreshness,
    },
  };
}

function findAvailabilityCandidates(
  inventory: InventoryReadModel,
  requestedDates: readonly string[],
  request: AvailabilitySearchApiRequest,
): readonly AvailabilityRoomCandidate[] {
  const byRoom = new Map<string, typeof inventory.dayRooms>();
  for (const dayRoom of inventory.dayRooms) {
    if (!requestedDates.includes(dayRoom.businessDate)) continue;
    if (request.roomTypeId && dayRoom.roomTypeId !== request.roomTypeId) continue;
    if (request.roomTypeKeyword && !matchesRoomTypeKeyword(dayRoom, request.roomTypeKeyword)) continue;
    byRoom.set(dayRoom.roomId, [...(byRoom.get(dayRoom.roomId) ?? []), dayRoom]);
  }

  return Array.from(byRoom.values())
    .filter((dayRooms) => dayRooms.length === requestedDates.length)
    .filter((dayRooms) => dayRooms.every((dayRoom) => dayRoom.availabilityStatus === 'available'))
    .map((dayRooms) => {
      const first = dayRooms[0]!;
      return {
        roomId: first.roomId,
        roomNumber: first.roomNumber,
        propertyId: first.propertyId,
        ...(first.roomTypeId ? { roomTypeId: first.roomTypeId } : {}),
        ...(first.roomType ? { roomType: first.roomType } : {}),
        availableDates: dayRooms.map((dayRoom) => dayRoom.businessDate).sort(),
        sourceRefs: dayRooms.flatMap((dayRoom) => dayRoom.sourceRefs),
      };
    })
    .sort((left, right) => left.roomNumber.localeCompare(right.roomNumber));
}

function matchesRoomTypeKeyword(dayRoom: InventoryReadModel['dayRooms'][number], keyword: string): boolean {
  const needle = keyword.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [dayRoom.roomTypeId, dayRoom.roomType, dayRoom.roomNumber]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

function dateRange(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  for (let cursor = startDate; cursor < endDate; cursor = addBusinessDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > 90) break;
  }
  return dates.length > 0 ? dates : [startDate];
}

function addBusinessDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function positiveIntegerOrUndefined(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

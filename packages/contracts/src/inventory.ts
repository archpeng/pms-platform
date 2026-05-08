import type { ProjectionFreshness,ReadModelStatus } from './readModels.js';
import { pmsProjectionSchemaVersion } from './readModels.js';
import type { SaleStatus } from './room.js';

export type InventoryBlockType = 'repair' | 'manualHold' | 'ownerBlock' | 'reservedInventory';
export type InventoryBlockStatus = 'active' | 'closed';
export type InventoryBlockSourceType = 'maintenance_ticket' | 'manual' | 'reservation' | 'stay' | 'room_status';
export type InventoryAvailabilityStatus = 'available' | 'blocked' | 'reserved' | 'occupied';
export type InventoryCalendarKind = InventoryAvailabilityStatus;
export type InventorySellableStatus = SaleStatus;

export interface InventorySourceRef {
  readonly sourceType: InventoryBlockSourceType | 'inventory_block';
  readonly sourceId: string;
  readonly label?: string;
}

export interface InventoryBlock {
  readonly blockId: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomTypeId?: string;
  readonly blockType: InventoryBlockType;
  readonly startDate: string;
  readonly endDate?: string;
  readonly status: InventoryBlockStatus;
  readonly sourceType: InventoryBlockSourceType;
  readonly sourceId: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
}

export interface InventoryDayRoom {
  readonly businessDate: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly availabilityStatus: InventoryAvailabilityStatus;
  readonly sourceRefs: readonly InventorySourceRef[];
  readonly updatedAt: string;
}

export interface InventoryIntervalProjection {
  readonly projectionId: string;
  readonly propertyId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly calendarKind: InventoryCalendarKind;
  readonly sellableStatus: InventorySellableStatus;
  readonly title: string;
  readonly sourceRefs: readonly InventorySourceRef[];
  readonly updatedAt: string;
}

export interface InventorySummaryDayType {
  readonly businessDate: string;
  readonly propertyId: string;
  readonly roomTypeId: string;
  readonly roomType?: string;
  readonly totalRooms: number;
  readonly availableRooms: number;
  readonly occupiedRooms: number;
  readonly blockedRooms: number;
  readonly reservedRooms: number;
  readonly updatedAt: string;
}

export interface InventoryHorizonRequest {
  readonly startDate: string;
  readonly horizonDays: 30 | 60 | 90 | number;
  readonly roomId?: string;
}

export interface InventoryReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly horizonDays: number;
  readonly summaryStatus: ReadModelStatus;
  readonly blocks: readonly InventoryBlock[];
  readonly dayRooms: readonly InventoryDayRoom[];
  readonly intervals: readonly InventoryIntervalProjection[];
  readonly summaries: readonly InventorySummaryDayType[];
  readonly projectionFreshness: ProjectionFreshness;
}

export type AvailabilityUnsupportedFilter = 'capacity';

export interface AvailabilitySearchRequestEcho {
  readonly startDate: string;
  readonly endDate: string;
  readonly roomTypeId?: string;
  readonly roomTypeKeyword?: string;
  readonly count?: number;
  readonly unsupportedFilters: readonly AvailabilityUnsupportedFilter[];
}

export interface AvailabilityRoomCandidate {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly availableDates: readonly string[];
  readonly sourceRefs: readonly InventorySourceRef[];
}

export interface AvailabilitySearchReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly request: AvailabilitySearchRequestEcho;
  readonly candidates: readonly AvailabilityRoomCandidate[];
  readonly candidateCount: number;
  readonly truncated: boolean;
  readonly projectionFreshness: ProjectionFreshness;
}

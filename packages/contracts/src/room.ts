export type OccupancyStatus = 'vacant' | 'occupied' | 'dueOut';
export type CleaningStatus = 'clean' | 'dirty' | 'cleaning' | 'inspection' | 'rework';
export type SaleStatus = 'sellable' | 'outOfOrder' | 'outOfService';

export interface RoomStatus {
  readonly occupancy: OccupancyStatus;
  readonly cleaning: CleaningStatus;
  readonly sale: SaleStatus;
}

export interface RoomState {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly propertyId?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly zone?: string;
  readonly sortKey?: string;
  readonly status: RoomStatus;
}

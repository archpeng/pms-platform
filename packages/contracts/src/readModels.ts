import type { HousekeepingTask } from './housekeeping.js';
import type { MaintenanceTicketStatus } from './maintenance.js';
import type { RoomState } from './room.js';

export const pmsProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export type ReadModelStatus = 'fresh' | 'stale' | 'partial' | 'unavailable';

export interface ProjectionFreshness {
  readonly status: ReadModelStatus;
  readonly generatedAt: string;
  readonly note: string;
}

export interface ReservationSummary {
  readonly reservationCode: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly guestLabel: string;
}

export const reservationStatuses = ['booked', 'checkedIn', 'checkedOut', 'cancelled'] as const;
export type ReservationStatus = typeof reservationStatuses[number];
export const stayStatuses = ['inHouse', 'checkedOut'] as const;
export type StayStatus = typeof stayStatuses[number];

export interface ReservationReadModel {
  readonly reservationId: string;
  readonly reservationCode: string;
  readonly propertyId: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly roomTypeId?: string;
  readonly roomType?: string;
  readonly guestDisplayName: string;
  readonly arrivalDate: string;
  readonly departureDate: string;
  readonly status: ReservationStatus;
  readonly projectionFreshness: ProjectionFreshness;
}

export interface StayReadModel {
  readonly stayId: string;
  readonly reservationId: string;
  readonly reservationCode?: string;
  readonly roomId?: string;
  readonly roomNumber?: string;
  readonly checkedInAt?: string;
  readonly checkedOutAt?: string;
  readonly status: StayStatus;
  readonly projectionFreshness: ProjectionFreshness;
}

export interface TodayReservationsReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly businessDate: string;
  readonly summaryStatus: ReadModelStatus;
  readonly reservations: readonly ReservationReadModel[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface ReservationSearchQuery {
  readonly guestDisplayName: string;
  readonly status?: ReservationStatus;
  readonly arrivalDateFrom?: string;
  readonly arrivalDateTo?: string;
  readonly limit: number;
}

export interface ReservationSearchReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly query: ReservationSearchQuery;
  readonly summaryStatus: ReadModelStatus;
  readonly reservations: readonly ReservationReadModel[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface RoomReservationContextReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly roomId: string;
  readonly roomNumber?: string;
  readonly roomType?: string;
  readonly reservations: readonly ReservationReadModel[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface MaintenanceTicketSummary {
  readonly ticketId: string;
  readonly roomId: string;
  readonly status: MaintenanceTicketStatus;
  readonly reason: string;
}

export interface RoomReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly room: RoomState | undefined;
  readonly activeReservation: ReservationSummary | undefined;
  readonly housekeepingTasks: readonly HousekeepingTask[];
  readonly maintenanceTickets: readonly MaintenanceTicketSummary[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface DashboardReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly counts: {
    readonly totalRooms: number;
    readonly vacantClean: number;
    readonly vacantDirty: number;
    readonly inHouse: number;
    readonly dueOut: number;
    readonly stopSell: number;
  };
  readonly queues: {
    readonly cleaning: number;
    readonly inspection: number;
    readonly pendingOperationRequests: number;
    readonly failedOperationRequests: number;
  };
  readonly projectionFreshness: ProjectionFreshness;
}

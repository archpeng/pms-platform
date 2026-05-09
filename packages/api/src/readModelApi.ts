import type {
  DashboardReadModel,
  InventoryHorizonRequest,
  InventoryReadModel,
  ReservationReadModel,
  RoomReadModel,
  RoomReservationContextReadModel,
  TodayReservationsReadModel,
} from '@pms-platform/contracts';
import { getDashboardReadModel, getRoomReadModel, type CorePorts } from '@pms-platform/core';
import {
  pmsDashboardOperation,
  pmsGetRoomOperation,
  pmsInventoryIntervalsOperation,
  pmsInventorySummaryOperation,
  pmsReservationGetOperation,
  pmsRoomReservationContextOperation,
  pmsTodayArrivalsOperation,
  pmsTodayDeparturesOperation,
} from './operations.js';
import type { AvailabilitySearchApiRequest, AvailabilitySearchApiResponse } from './availability.js';
import type { HotelProfileApiRequest, HotelProfileApiResponse, RoomTypeCatalogApiRequest, RoomTypeCatalogApiResponse } from './hotelProfileApi.js';

export interface GetRoomApiRequest {
  readonly operation: typeof pmsGetRoomOperation;
  readonly roomId: string;
  readonly requestedAt: string;
}

export interface GetRoomApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsGetRoomOperation;
  readonly readModel: RoomReadModel;
}

export interface DashboardApiRequest {
  readonly operation: typeof pmsDashboardOperation;
  readonly requestedAt: string;
}

export interface DashboardApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsDashboardOperation;
  readonly readModel: DashboardReadModel;
}

export interface ReservationGetApiRequest {
  readonly operation: typeof pmsReservationGetOperation;
  readonly reservationCode: string;
  readonly requestedAt: string;
}

export interface ReservationGetApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsReservationGetOperation;
  readonly readModel?: ReservationReadModel;
}

export interface TodayReservationsApiRequest {
  readonly operation: typeof pmsTodayArrivalsOperation | typeof pmsTodayDeparturesOperation;
  readonly businessDate: string;
  readonly requestedAt: string;
}

export interface TodayReservationsApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsTodayArrivalsOperation | typeof pmsTodayDeparturesOperation;
  readonly readModel: TodayReservationsReadModel;
}

export interface RoomReservationContextApiRequest {
  readonly operation: typeof pmsRoomReservationContextOperation;
  readonly roomId: string;
  readonly requestedAt: string;
}

export interface RoomReservationContextApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsRoomReservationContextOperation;
  readonly readModel: RoomReservationContextReadModel;
}

export interface InventoryIntervalsApiRequest extends InventoryHorizonRequest {
  readonly operation: typeof pmsInventoryIntervalsOperation;
}

export interface InventoryIntervalsApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsInventoryIntervalsOperation;
  readonly readModel: InventoryReadModel;
}

export interface InventorySummaryApiRequest extends InventoryHorizonRequest {
  readonly operation: typeof pmsInventorySummaryOperation;
}

export interface InventorySummaryApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsInventorySummaryOperation;
  readonly readModel: InventoryReadModel;
}

export type PmsReadModelApiRequest =
  | GetRoomApiRequest
  | DashboardApiRequest
  | ReservationGetApiRequest
  | TodayReservationsApiRequest
  | RoomReservationContextApiRequest
  | InventoryIntervalsApiRequest
  | InventorySummaryApiRequest
  | AvailabilitySearchApiRequest
  | HotelProfileApiRequest
  | RoomTypeCatalogApiRequest;
export type PmsReadModelApiResponse =
  | GetRoomApiResponse
  | DashboardApiResponse
  | ReservationGetApiResponse
  | TodayReservationsApiResponse
  | RoomReservationContextApiResponse
  | InventoryIntervalsApiResponse
  | InventorySummaryApiResponse
  | AvailabilitySearchApiResponse
  | HotelProfileApiResponse
  | RoomTypeCatalogApiResponse;

export function executeGetRoomApiRequest(request: GetRoomApiRequest, ports: CorePorts): GetRoomApiResponse {
  return {
    ok: true,
    operation: pmsGetRoomOperation,
    readModel: getRoomReadModel(request.roomId, ports, request.requestedAt),
  };
}

export function executeDashboardApiRequest(request: DashboardApiRequest, ports: CorePorts): DashboardApiResponse {
  return {
    ok: true,
    operation: pmsDashboardOperation,
    readModel: getDashboardReadModel(ports, request.requestedAt),
  };
}

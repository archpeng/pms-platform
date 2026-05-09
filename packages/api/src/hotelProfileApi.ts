import type {
  HotelProfileReadModel,
  RoomTypeCatalogReadModel,
} from '@pms-platform/contracts';
import {
  pmsHotelProfileOperation,
  pmsRoomTypeCatalogOperation,
} from './operations.js';

export interface HotelProfileApiRequest {
  readonly operation: typeof pmsHotelProfileOperation;
  readonly propertyId?: string;
  readonly requestedAt: string;
}

export interface HotelProfileApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsHotelProfileOperation;
  readonly readModel: HotelProfileReadModel;
}

export interface RoomTypeCatalogApiRequest {
  readonly operation: typeof pmsRoomTypeCatalogOperation;
  readonly propertyId?: string;
  readonly requestedAt: string;
}

export interface RoomTypeCatalogApiResponse {
  readonly ok: true;
  readonly operation: typeof pmsRoomTypeCatalogOperation;
  readonly readModel: RoomTypeCatalogReadModel;
}

export function executeHotelProfileApiRequest(
  request: HotelProfileApiRequest,
  readHotelProfile: (propertyId: string | undefined, generatedAt: string) => HotelProfileReadModel,
): HotelProfileApiResponse {
  return {
    ok: true,
    operation: pmsHotelProfileOperation,
    readModel: readHotelProfile(request.propertyId, request.requestedAt),
  };
}

export function executeRoomTypeCatalogApiRequest(
  request: RoomTypeCatalogApiRequest,
  readRoomTypeCatalog: (propertyId: string | undefined, generatedAt: string) => RoomTypeCatalogReadModel,
): RoomTypeCatalogApiResponse {
  return {
    ok: true,
    operation: pmsRoomTypeCatalogOperation,
    readModel: readRoomTypeCatalog(request.propertyId, request.requestedAt),
  };
}

import type { ProjectionFreshness, ReadModelStatus } from './readModels.js';
import { pmsProjectionSchemaVersion } from './readModels.js';

export interface RoomTypeCatalogItem {
  readonly roomTypeId: string;
  readonly code: string;
  readonly displayName: string;
  readonly roomCount: number;
  readonly status: string;
}

export interface RoomTypeCatalogReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly propertyId?: string;
  readonly roomTypes: readonly RoomTypeCatalogItem[];
  readonly projectionFreshness: ProjectionFreshness;
}

export interface HotelProfileReadModel {
  readonly schemaVersion: typeof pmsProjectionSchemaVersion;
  readonly generatedAt: string;
  readonly summaryStatus: ReadModelStatus;
  readonly propertyId: string;
  readonly propertyName: string;
  readonly timeZone: string;
  readonly status: string;
  readonly roomTotal: number;
  readonly roomTypes: readonly RoomTypeCatalogItem[];
  readonly address?: string;
  readonly phone?: string;
  readonly projectionFreshness: ProjectionFreshness;
}

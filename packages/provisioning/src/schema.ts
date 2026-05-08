export const pmsBaseProvisioningSchemaVersion = 'pms-base-provisioning-v1';
export const pmsBaseProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export type PmsBaseTableLogicalName =
  | 'RoomLedger'
  | 'OperationRequests'
  | 'HousekeepingTasks'
  | 'MaintenanceTickets'
  | 'Reservations'
  | 'Stays'
  | 'OperationLogs'
  | 'InventoryCalendar'
  | 'ProjectionStatus';
export type PmsBaseFieldKind = 'text' | 'longText' | 'singleSelect' | 'dateTime' | 'number' | 'linkedRecord';
export type PmsBaseWorkflow =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'HOUSEKEEPING_DONE'
  | 'HOUSEKEEPING_INSPECTION'
  | 'HOUSEKEEPING_REWORK'
  | 'REPORT_MAINTENANCE'
  | 'MAINTENANCE_DONE'
  | 'RESTORE_SELLABLE';
export type OperationRequestStrategy = 'adapterUpsert' | 'seedRows' | 'managedForm';
export type LarkCliProvisioningMode = 'dryRun' | 'apply';

export interface HotelRoomStatusProfile {
  readonly occupancyStatus: '空房' | '在住' | '预离';
  readonly cleaningStatus: '干净' | '脏房' | '清洁中' | '待查' | '返工';
  readonly sellableStatus: '可售' | '停售维修' | '停售保留' | '停售业主';
}

export interface HotelRoomProfile {
  readonly roomNumber: string;
  readonly roomType: string;
  readonly zone: string;
  readonly initialStatus: HotelRoomStatusProfile;
}

export interface HotelProfile {
  readonly propertyKey: string;
  readonly propertyName: string;
  readonly baseDisplayName: string;
  readonly timeZone: string;
  readonly rooms: readonly HotelRoomProfile[];
  readonly proofRoomNumbers: readonly string[];
  readonly enabledWorkflows: readonly PmsBaseWorkflow[];
  readonly operationRequestStrategy: OperationRequestStrategy;
  readonly dashboardFeatures: readonly string[];
}

export type HotelProfileCandidate = Partial<Omit<HotelProfile, 'rooms'>> & {
  readonly rooms?: readonly Partial<HotelRoomProfile>[];
};

export interface PmsBaseLinkedRecordSpec {
  readonly targetTableLogicalName: PmsBaseTableLogicalName;
  readonly targetDisplayFieldName: string;
  readonly cardinality: 'single' | 'multiple';
  readonly configMode: 'symbolic';
}

export interface PmsBaseFieldSpec {
  readonly logicalName: string;
  readonly displayName: string;
  readonly kind: PmsBaseFieldKind;
  readonly required: boolean;
  readonly hidden?: boolean;
  readonly options?: readonly string[];
  readonly linkedRecord?: PmsBaseLinkedRecordSpec;
}

export interface PmsBaseViewSpec {
  readonly logicalName: string;
  readonly displayName: string;
  readonly kind: 'grid' | 'kanban' | 'form' | 'gantt' | 'calendar' | 'gallery';
  readonly filterHint?: string;
}

export interface PmsBaseFormSpec {
  readonly logicalName: string;
  readonly displayName: string;
  readonly tableLogicalName: PmsBaseTableLogicalName;
  readonly description: string;
}

export interface PmsBaseSeedRecordSpec {
  readonly logicalKey: string;
  readonly fields: Record<string, string | number | boolean | null>;
}

export interface PmsBaseUpsertPolicy {
  readonly strategy: OperationRequestStrategy;
  readonly uniqueField: string;
  readonly createOnMissing: boolean;
  readonly updateAllowedFields: readonly string[];
}

export interface PmsBaseTableSpec {
  readonly logicalName: PmsBaseTableLogicalName;
  readonly displayName: string;
  readonly fields: readonly PmsBaseFieldSpec[];
  readonly views: readonly PmsBaseViewSpec[];
  readonly seedRecords: readonly PmsBaseSeedRecordSpec[];
  readonly upsertPolicy?: PmsBaseUpsertPolicy;
}

export interface PmsBaseProjectionBindingTemplate {
  readonly tableLogicalName: PmsBaseTableLogicalName;
  readonly fieldMap: Record<string, string>;
  readonly requiredFields: readonly string[];
  readonly updateAllowedFields: readonly string[];
}

export interface PmsBaseProjectionRegistryTemplate {
  readonly version: 1;
  readonly targetPolicy: {
    readonly generatedTargetsAreLocalOnly: true;
    readonly exampleTargetHint?: string;
  };
  readonly bindings: {
    readonly roomLedger: PmsBaseProjectionBindingTemplate;
    readonly operationRequests: PmsBaseProjectionBindingTemplate;
    readonly housekeepingTasks: PmsBaseProjectionBindingTemplate;
    readonly maintenanceTickets: PmsBaseProjectionBindingTemplate;
    readonly reservations: PmsBaseProjectionBindingTemplate;
    readonly stays: PmsBaseProjectionBindingTemplate;
    readonly inventoryCalendar: PmsBaseProjectionBindingTemplate;
    readonly operationLogs: PmsBaseProjectionBindingTemplate;
    readonly projectionStatus: PmsBaseProjectionBindingTemplate;
  };
}

export interface PmsBaseProvisioningSpec {
  readonly schemaVersion: typeof pmsBaseProvisioningSchemaVersion;
  readonly base: {
    readonly logicalName: string;
    readonly displayName: string;
    readonly timeZone: string;
  };
  readonly profile: HotelProfile;
  readonly proof: {
    readonly proofRoomNumbers: readonly string[];
    readonly requiredWorkflows: readonly PmsBaseWorkflow[];
  };
  readonly tables: readonly PmsBaseTableSpec[];
  readonly forms: readonly PmsBaseFormSpec[];
  readonly adapterRegistryBindings: {
    readonly pmsBaseProjection: PmsBaseProjectionRegistryTemplate;
  };
  readonly validationGates: readonly string[];
}

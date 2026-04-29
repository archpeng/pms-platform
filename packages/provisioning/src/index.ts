import { spawn } from 'node:child_process';

export const pmsBaseProvisioningSchemaVersion = 'pms-base-provisioning-v1';
export const pmsBaseProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

function smallHotelRoomType(roomNumber: string): string {
  if (roomNumber.startsWith('A') || roomNumber.startsWith('B') || roomNumber === 'C1' || roomNumber === 'E2') return '花园别墅';
  if (roomNumber.startsWith('D')) return '秘境洞穴';
  if (roomNumber === 'C2' || roomNumber === 'E1') return '花园套房';
  return '花园别墅';
}

export type PmsBaseTableLogicalName =
  | 'RoomLedger'
  | 'OperationRequests'
  | 'HousekeepingTasks'
  | 'MaintenanceTickets'
  | 'Reservations'
  | 'OperationLogs'
  | 'InventoryCalendar';
export type PmsBaseFieldKind = 'text' | 'longText' | 'singleSelect' | 'dateTime' | 'number';
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

export interface PmsBaseFieldSpec {
  readonly logicalName: string;
  readonly displayName: string;
  readonly kind: PmsBaseFieldKind;
  readonly required: boolean;
  readonly options?: readonly string[];
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
    readonly operationLogs: PmsBaseProjectionBindingTemplate;
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

export interface LarkCliProvisioningPlanOptions {
  readonly mode: LarkCliProvisioningMode;
  readonly profile?: string;
  readonly identity?: 'user' | 'bot';
  readonly folderTokenEnv?: string;
  readonly baseTokenEnv?: string;
  readonly includeBaseCreate?: boolean;
  readonly allowApply?: boolean;
}

export type LarkCliProvisioningOperationKind =
  | 'base-create'
  | 'table-create'
  | 'field-create'
  | 'view-create'
  | 'form-create'
  | 'record-batch-create'
  | 'dashboard-create';

export interface LarkCliProvisioningOperation {
  readonly kind: LarkCliProvisioningOperationKind;
  readonly logicalName: string;
  readonly command: readonly string[];
  readonly envRefs: readonly string[];
}

export interface LarkCliProvisioningPlan {
  readonly mode: LarkCliProvisioningMode;
  readonly allowApply: boolean;
  readonly profile?: string;
  readonly operationCount: number;
  readonly operations: readonly LarkCliProvisioningOperation[];
}

export interface LarkCliRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type LarkCliRunner = (
  command: readonly string[],
  operation: LarkCliProvisioningOperation,
) => Promise<LarkCliRunResult>;

export interface ExecuteLarkCliProvisioningPlanOptions {
  readonly runner?: LarkCliRunner;
}

export interface ExecuteLarkCliProvisioningPlanResult {
  readonly mode: LarkCliProvisioningMode;
  readonly executed: boolean;
  readonly operationCount: number;
  readonly results: readonly LarkCliRunResult[];
}

const requiredTables: readonly PmsBaseTableLogicalName[] = [
  'RoomLedger',
  'OperationRequests',
  'HousekeepingTasks',
  'MaintenanceTickets',
  'Reservations',
  'OperationLogs',
  'InventoryCalendar',
];

const requiredOperationRequestFields = [
  '请求令牌',
  '操作类型',
  '操作状态',
  '房号',
  '操作人',
  '原因',
  '请求时间',
  '请求JSON',
  '结果JSON',
  '版本',
] as const;

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
  rooms: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'D3', 'D4', 'D5', 'E1', 'E2'].map((roomNumber) => ({
    roomNumber,
    roomType: smallHotelRoomType(roomNumber),
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

export function createSmallHotelPmsBaseProvisioningSpec(profile: HotelProfile = smallHotelProfileFixture): PmsBaseProvisioningSpec {
  return {
    schemaVersion: pmsBaseProvisioningSchemaVersion,
    base: {
      logicalName: profile.propertyKey,
      displayName: profile.baseDisplayName,
      timeZone: profile.timeZone,
    },
    profile,
    proof: {
      proofRoomNumbers: profile.proofRoomNumbers,
      requiredWorkflows: profile.enabledWorkflows,
    },
    tables: [
      roomLedgerTable(profile),
      operationRequestsTable(profile),
      housekeepingTasksTable(),
      maintenanceTicketsTable(),
      reservationsTable(),
      operationLogsTable(),
      inventoryCalendarTable(),
    ],
    forms: [
      {
        logicalName: 'operation-request-intake',
        displayName: 'PMS操作请求表单',
        tableLogicalName: 'OperationRequests',
        description: '受控 PMS 操作请求入口；确认类操作仍必须来自卡片回调。',
      },
    ],
    adapterRegistryBindings: {
      pmsBaseProjection: {
        version: 1,
        targetPolicy: {
          generatedTargetsAreLocalOnly: true,
        },
        bindings: {
          roomLedger: {
            tableLogicalName: 'RoomLedger',
            fieldMap: {
              roomNumber: '房号',
              roomType: '房型',
              occupancyStatus: '入住状态',
              cleaningStatus: '清洁状态',
              sellableStatus: '可售状态',
              roomCode: '房态码',
              currentReservationCode: '当前预订',
              maintenanceNote: '维修备注',
              housekeepingTaskStatus: '保洁任务状态',
              lastOperator: '最后操作人',
              lastReason: '最后原因',
              lastUpdatedAt: '更新时间',
            },
            requiredFields: [
              'roomNumber',
              'roomType',
              'occupancyStatus',
              'cleaningStatus',
              'sellableStatus',
              'roomCode',
              'lastOperator',
              'lastReason',
              'lastUpdatedAt',
            ],
            updateAllowedFields: [
              'roomType',
              'occupancyStatus',
              'cleaningStatus',
              'sellableStatus',
              'roomCode',
              'currentReservationCode',
              'maintenanceNote',
              'housekeepingTaskStatus',
              'lastOperator',
              'lastReason',
              'lastUpdatedAt',
            ],
          },
          operationRequests: {
            tableLogicalName: 'OperationRequests',
            fieldMap: {
              clientToken: '请求令牌',
              action: '操作类型',
              status: '操作状态',
              roomNumber: '房号',
              operator: '操作人',
              reason: '原因',
              requestedAt: '请求时间',
              payloadJSON: '请求JSON',
              resultJSON: '结果JSON',
              schemaVersion: '版本',
            },
            requiredFields: ['clientToken', 'action', 'status', 'roomNumber', 'operator', 'reason', 'requestedAt', 'schemaVersion'],
            updateAllowedFields: ['status', 'resultJSON', 'schemaVersion'],
          },
          housekeepingTasks: {
            tableLogicalName: 'HousekeepingTasks',
            fieldMap: {
              taskId: '任务ID',
              roomNumber: '房号',
              kind: '任务类型',
              status: '任务状态',
              reason: '原因',
              correlationId: '关联ID',
              createdAt: '创建时间',
              completedAt: '完成时间',
              schemaVersion: '版本',
            },
            requiredFields: ['taskId', 'roomNumber', 'kind', 'status', 'reason', 'correlationId', 'createdAt', 'schemaVersion'],
            updateAllowedFields: ['status', 'reason', 'completedAt', 'schemaVersion'],
          },
          maintenanceTickets: {
            tableLogicalName: 'MaintenanceTickets',
            fieldMap: {
              ticketId: '工单ID',
              roomNumber: '房号',
              status: '工单状态',
              severity: '严重级别',
              stopSellRequested: '是否停售',
              reason: '维修备注',
              correlationId: '关联ID',
              createdAt: '创建时间',
              resolvedAt: '完成时间',
              schemaVersion: '版本',
            },
            requiredFields: ['ticketId', 'roomNumber', 'status', 'severity', 'stopSellRequested', 'reason', 'correlationId', 'createdAt', 'schemaVersion'],
            updateAllowedFields: ['status', 'resolvedAt', 'schemaVersion'],
          },
          reservations: {
            tableLogicalName: 'Reservations',
            fieldMap: {
              reservationCode: '预订号',
              roomNumber: '房号',
              guestLabel: '客人',
              arrivalDate: '到店日期',
              departureDate: '离店日期',
              status: '预订状态',
              schemaVersion: '版本',
            },
            requiredFields: ['reservationCode', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion'],
            updateAllowedFields: ['roomNumber', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion'],
          },
          operationLogs: {
            tableLogicalName: 'OperationLogs',
            fieldMap: {
              auditId: '审计ID',
              commandType: '操作类型',
              roomNumber: '房号',
              actor: '操作人',
              source: '来源',
              reason: '原因',
              idempotencyKey: '幂等键',
              correlationId: '关联ID',
              occurredAt: '发生时间',
              domainEventTypes: '领域事件',
              payloadJSON: '载荷JSON',
              schemaVersion: '版本',
            },
            requiredFields: [
              'auditId',
              'commandType',
              'roomNumber',
              'actor',
              'source',
              'reason',
              'idempotencyKey',
              'correlationId',
              'occurredAt',
              'domainEventTypes',
              'schemaVersion',
            ],
            updateAllowedFields: [],
          },
        },
      },
    },
    validationGates: [
      'required_tables',
      'required_fields',
      'proof_rooms_seeded',
      'operation_request_upsert_policy',
      'no_tracked_target_values',
    ],
  };
}

export function validatePmsBaseProvisioningSpec(spec: PmsBaseProvisioningSpec): string[] {
  const errors: string[] = [];
  const tablesByName = new Map(spec.tables.map((table) => [table.logicalName, table]));

  for (const tableName of requiredTables) {
    if (!tablesByName.has(tableName)) {
      errors.push(`required_table_missing:${tableName}`);
    }
  }

  if (spec.proof.proofRoomNumbers.length < 2) {
    errors.push('proof_room_pair_required');
  }

  const seededRoomNumbers = new Set(
    tablesByName.get('RoomLedger')?.seedRecords
      .map((record) => stringValue(record.fields['房号']))
      .filter(isNonEmptyString) ?? [],
  );
  for (const proofRoomNumber of spec.proof.proofRoomNumbers) {
    if (!seededRoomNumbers.has(proofRoomNumber)) {
      errors.push(`proof_room_seed_missing:${proofRoomNumber}`);
    }
  }

  for (const table of spec.tables) {
    const displayNames = new Set<string>();
    for (const field of table.fields) {
      if (displayNames.has(field.displayName)) {
        errors.push(`duplicate_field_display_name:${table.logicalName}:${field.displayName}`);
      }
      displayNames.add(field.displayName);
    }
  }

  const operationRequests = tablesByName.get('OperationRequests');
  if (operationRequests) {
    for (const field of requiredOperationRequestFields) {
      if (!operationRequests.fields.some((candidate) => candidate.displayName === field)) {
        errors.push(`operation_request_field_missing:${field}`);
      }
    }
    if (!operationRequests.upsertPolicy) {
      errors.push('operation_requests_upsert_policy_required');
    }
  }

  for (const error of findTrackedTargetValues(spec)) {
    errors.push(error);
  }

  return errors;
}

export function buildLarkCliProvisioningPlan(
  spec: PmsBaseProvisioningSpec,
  options: LarkCliProvisioningPlanOptions,
): LarkCliProvisioningPlan {
  const dryRun = options.mode === 'dryRun';
  const baseTokenRef = envRef(options.baseTokenEnv ?? 'PMS_BASE_PROVISIONING_BASE_TOKEN');
  const globalFlags = options.profile ? ['--profile', options.profile] : [];
  const identityFlags = options.identity ? ['--as', options.identity] : [];
  const dryRunFlag = dryRun ? ['--dry-run'] : [];
  const baseTokenFlags = ['--base-token', baseTokenRef];
  const operations: LarkCliProvisioningOperation[] = [];
  if (options.includeBaseCreate !== false) {
    operations.push({
      kind: 'base-create',
      logicalName: spec.base.logicalName,
      command: [
        'lark-cli',
        'base',
        '+base-create',
        ...identityFlags,
        '--name',
        spec.base.displayName,
        '--time-zone',
        spec.base.timeZone,
        ...(options.folderTokenEnv ? ['--folder-token', envRef(options.folderTokenEnv)] : []),
        ...dryRunFlag,
        ...globalFlags,
      ],
      envRefs: options.folderTokenEnv ? [options.folderTokenEnv] : [],
    });
  }

  for (const table of spec.tables) {
    operations.push({
      kind: 'table-create',
      logicalName: table.logicalName,
      command: [
        'lark-cli',
        'base',
        '+table-create',
        ...identityFlags,
        ...baseTokenFlags,
        '--name',
        table.displayName,
        ...dryRunFlag,
        ...globalFlags,
      ],
      envRefs: [envNameFromRef(baseTokenRef)],
    });

    for (const field of table.fields) {
      operations.push({
        kind: 'field-create',
        logicalName: `${table.logicalName}.${field.logicalName}`,
        command: [
          'lark-cli',
          'base',
          '+field-create',
          ...identityFlags,
          ...baseTokenFlags,
          '--table-id',
          table.displayName,
          '--json',
          JSON.stringify(toLarkFieldJson(field)),
          ...dryRunFlag,
          ...globalFlags,
        ],
        envRefs: [envNameFromRef(baseTokenRef)],
      });
    }

    if (table.views.length > 0) {
      operations.push({
        kind: 'view-create',
        logicalName: `${table.logicalName}.views`,
        command: [
          'lark-cli',
          'base',
          '+view-create',
          ...identityFlags,
          ...baseTokenFlags,
          '--table-id',
          table.displayName,
          '--json',
          JSON.stringify(table.views.map(toLarkViewJson)),
          ...dryRunFlag,
          ...globalFlags,
        ],
        envRefs: [envNameFromRef(baseTokenRef)],
      });
    }

    if (table.seedRecords.length > 0) {
      operations.push({
        kind: 'record-batch-create',
        logicalName: `${table.logicalName}.seedRecords`,
        command: [
          'lark-cli',
          'base',
          '+record-batch-create',
          ...identityFlags,
          ...baseTokenFlags,
          '--table-id',
          table.displayName,
          '--json',
          JSON.stringify(toRecordBatchJson(table)),
          ...dryRunFlag,
          ...globalFlags,
        ],
        envRefs: [envNameFromRef(baseTokenRef)],
      });
    }
  }

  for (const form of spec.forms) {
    operations.push({
      kind: 'form-create',
      logicalName: form.logicalName,
      command: [
        'lark-cli',
        'base',
        '+form-create',
        ...identityFlags,
        ...baseTokenFlags,
        '--table-id',
        requiredTable(spec, form.tableLogicalName).displayName,
        '--name',
        form.displayName,
        '--description',
        form.description,
        ...dryRunFlag,
        ...globalFlags,
      ],
      envRefs: [envNameFromRef(baseTokenRef)],
    });
  }

  operations.push({
    kind: 'dashboard-create',
    logicalName: 'frontdesk-dashboard',
    command: [
      'lark-cli',
      'base',
      '+dashboard-create',
      ...identityFlags,
      ...baseTokenFlags,
      '--name',
      `${spec.profile.propertyName}看板`,
      '--theme-style',
      'default',
      ...dryRunFlag,
      ...globalFlags,
    ],
    envRefs: [envNameFromRef(baseTokenRef)],
  });

  return {
    mode: options.mode,
    allowApply: options.allowApply === true,
    profile: options.profile,
    operationCount: operations.length,
    operations,
  };
}

export async function executeLarkCliProvisioningPlan(
  plan: LarkCliProvisioningPlan,
  options: ExecuteLarkCliProvisioningPlanOptions = {},
): Promise<ExecuteLarkCliProvisioningPlanResult> {
  if (plan.mode === 'dryRun') {
    return {
      mode: 'dryRun',
      executed: false,
      operationCount: plan.operations.length,
      results: [],
    };
  }

  if (!plan.allowApply) {
    throw new Error('apply_not_allowed');
  }

  const runner = options.runner ?? defaultLarkCliRunner;
  const results: LarkCliRunResult[] = [];
  for (const operation of plan.operations) {
    const result = await runner(materializeEnvRefs(operation.command, operation.envRefs), operation);
    results.push(result);
    if (result.exitCode !== 0) {
      throw new Error(`lark_cli_operation_failed:${operation.kind}:${operation.logicalName}:${result.exitCode}`);
    }
  }

  return {
    mode: 'apply',
    executed: true,
    operationCount: plan.operations.length,
    results,
  };
}

function roomLedgerTable(profile: HotelProfile): PmsBaseTableSpec {
  return {
    logicalName: 'RoomLedger',
    displayName: '房态台账',
    fields: [
      textField('roomNumber', '房号'),
      textField('roomType', '房型'),
      textField('zone', '区域', false),
      selectField('occupancyStatus', '入住状态', ['空房', '在住', '预离']),
      selectField('cleaningStatus', '清洁状态', ['干净', '脏房', '清洁中', '待查', '返工']),
      selectField('sellableStatus', '可售状态', ['可售', '停售维修', '停售保留', '停售业主']),
      textField('roomCode', '房态码'),
      textField('currentReservationCode', '当前预订', false),
      textField('maintenanceNote', '维修备注', false),
      textField('housekeepingTaskStatus', '保洁任务状态', false),
      textField('lastOperator', '最后操作人'),
      textField('lastReason', '最后原因'),
      dateTimeField('lastUpdatedAt', '更新时间'),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'frontdesk-all-rooms', displayName: '全部房态', kind: 'grid' },
      { logicalName: 'cleaning-queue', displayName: '保洁队列', kind: 'grid', filterHint: '清洁状态 in 脏房,清洁中,待查,返工' },
      { logicalName: 'maintenance-stop-sell', displayName: '停售维修', kind: 'grid', filterHint: '可售状态 = 停售维修' },
    ],
    seedRecords: profile.rooms.map((room) => ({
      logicalKey: `room:${room.roomNumber}`,
      fields: {
        房号: room.roomNumber,
        房型: room.roomType,
        区域: room.zone,
        入住状态: room.initialStatus.occupancyStatus,
        清洁状态: room.initialStatus.cleaningStatus,
        可售状态: room.initialStatus.sellableStatus,
        房态码: `${room.roomNumber}:${room.initialStatus.occupancyStatus}:${room.initialStatus.cleaningStatus}:${room.initialStatus.sellableStatus}`,
        当前预订: null,
        维修备注: null,
        保洁任务状态: null,
        最后操作人: 'provisioning-seed',
        最后原因: '初始种子房间',
        更新时间: '2026-04-28T00:00:00.000Z',
        版本: pmsBaseProjectionSchemaVersion,
      },
    })),
  };
}

function operationRequestsTable(profile: HotelProfile): PmsBaseTableSpec {
  return {
    logicalName: 'OperationRequests',
    displayName: 'PMS操作请求',
    fields: [
      textField('clientToken', '请求令牌'),
      selectField('action', '操作类型', ['CHECK_IN', 'CHECK_OUT', 'HOUSEKEEPING_DONE', 'HOUSEKEEPING_INSPECTION', 'HOUSEKEEPING_REWORK', 'REPORT_MAINTENANCE', 'MAINTENANCE_DONE', 'RESTORE_SELLABLE']),
      selectField('status', '操作状态', ['待处理', '待确认', '处理中', '已完成', '失败', '需人工复核', '已过期', '重复忽略']),
      textField('roomNumber', '房号'),
      textField('operator', '操作人'),
      textField('reason', '原因'),
      dateTimeField('requestedAt', '请求时间'),
      longTextField('payloadJSON', '请求JSON', false),
      longTextField('resultJSON', '结果JSON', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'pending-operations', displayName: '待处理操作', kind: 'grid', filterHint: '操作状态 in 待处理,待确认,处理中,需人工复核' },
      { logicalName: 'failed-operations', displayName: '失败操作', kind: 'grid', filterHint: '操作状态 = 失败' },
    ],
    seedRecords: profile.proofRoomNumbers.flatMap((roomNumber) =>
      profile.enabledWorkflows.map((workflow) => ({
        logicalKey: `operation:${workflow}:${roomNumber}`,
        fields: {
          请求令牌: `sandbox-${workflow.toLowerCase().replaceAll('_', '-')}-${roomNumber}`,
          操作类型: workflow,
          操作状态: '待处理',
          房号: roomNumber,
          操作人: 'provisioning-seed',
          原因: `seed ${workflow} proof request`,
          请求时间: '2026-04-28T00:00:00.000Z',
          请求JSON: JSON.stringify({ workflow, roomNumber }),
          结果JSON: null,
          版本: pmsBaseProjectionSchemaVersion,
        },
      })),
    ),
    upsertPolicy: {
      strategy: profile.operationRequestStrategy,
      uniqueField: '请求令牌',
      createOnMissing: profile.operationRequestStrategy === 'adapterUpsert',
      updateAllowedFields: ['操作状态', '结果JSON', '版本'],
    },
  };
}

function housekeepingTasksTable(): PmsBaseTableSpec {
  return {
    logicalName: 'HousekeepingTasks',
    displayName: '保洁任务',
    fields: [
      textField('taskId', '任务ID'),
      textField('roomNumber', '房号'),
      selectField('kind', '任务类型', ['checkout-cleaning', 'room-cleaning', 'rework-cleaning']),
      selectField('status', '任务状态', ['待处理', '处理中', '待查', '返工', '已完成', '已取消']),
      textField('reason', '原因'),
      textField('correlationId', '关联ID'),
      dateTimeField('createdAt', '创建时间'),
      dateTimeField('completedAt', '完成时间', false),
      textField('schemaVersion', '版本'),
    ],
    views: [{ logicalName: 'active-housekeeping', displayName: '当前保洁任务', kind: 'grid' }],
    seedRecords: [],
  };
}

function maintenanceTicketsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'MaintenanceTickets',
    displayName: '维修工单',
    fields: [
      textField('ticketId', '工单ID'),
      textField('roomNumber', '房号'),
      selectField('status', '工单状态', ['待处理', '处理中', '已完成']),
      selectField('severity', '严重级别', ['Low', 'Medium', 'High', 'StopSell']),
      selectField('stopSellRequested', '是否停售', ['是', '否']),
      textField('reason', '维修备注'),
      textField('correlationId', '关联ID'),
      dateTimeField('createdAt', '创建时间'),
      dateTimeField('resolvedAt', '完成时间', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'active-maintenance', displayName: '当前维修', kind: 'grid' },
      { logicalName: 'maintenance-stop-sell', displayName: '维修停售', kind: 'grid', filterHint: '是否停售 = 是' },
    ],
    seedRecords: [],
  };
}

function reservationsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'Reservations',
    displayName: '预订',
    fields: [
      textField('reservationCode', '预订号'),
      textField('roomNumber', '房号', false),
      textField('guestLabel', '客人'),
      dateTimeField('arrivalDate', '到店日期'),
      dateTimeField('departureDate', '离店日期'),
      selectField('status', '预订状态', ['已预订', '已入住', '已离店', '已取消']),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'today-arrivals', displayName: '今日到店', kind: 'grid' },
      { logicalName: 'today-departures', displayName: '今日离店', kind: 'grid' },
    ],
    seedRecords: [],
  };
}

function inventoryCalendarTable(): PmsBaseTableSpec {
  return {
    logicalName: 'InventoryCalendar',
    displayName: '库存日历',
    fields: [
      textField('calendarTitle', '日历标题'),
      textField('roomNumber', '房号'),
      textField('roomType', '房型'),
      textField('zone', '区域', false),
      dateTimeField('businessDate', '营业日'),
      dateTimeField('startDate', '开始日期'),
      dateTimeField('endDate', '结束日期'),
      selectField('calendarKind', '日历类型', ['库存基线', '预订占用', '维修停售', '保留停售', '业主停售', '保洁周转']),
      selectField('sellableStatus', '可售状态', ['可售', '停售维修', '停售保留', '停售业主']),
      textField('source', '来源'),
      textField('sortKey', '房号排序'),
      textField('reason', '原因', false),
      textField('schemaVersion', '版本'),
    ],
    views: [
      { logicalName: 'inventory-calendar', displayName: '库存日历', kind: 'gantt' },
      { logicalName: 'inventory-detail', displayName: '库存明细', kind: 'grid' },
    ],
    seedRecords: [],
  };
}

function operationLogsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'OperationLogs',
    displayName: '操作日志',
    fields: [
      textField('auditId', '审计ID'),
      selectField('commandType', '操作类型', ['CHECK_IN', 'CHECK_OUT', 'HOUSEKEEPING_DONE', 'HOUSEKEEPING_INSPECTION', 'HOUSEKEEPING_REWORK', 'REPORT_MAINTENANCE', 'MAINTENANCE_DONE', 'RESTORE_SELLABLE']),
      textField('roomNumber', '房号'),
      textField('actor', '操作人'),
      textField('source', '来源'),
      textField('reason', '原因'),
      textField('idempotencyKey', '幂等键'),
      textField('correlationId', '关联ID'),
      dateTimeField('occurredAt', '发生时间'),
      longTextField('domainEventTypes', '领域事件'),
      longTextField('payloadJSON', '载荷JSON', false),
      textField('schemaVersion', '版本'),
    ],
    views: [{ logicalName: 'recent-operation-logs', displayName: '最近操作日志', kind: 'grid' }],
    seedRecords: [],
  };
}

function textField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'text', required };
}

function longTextField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'longText', required };
}

function dateTimeField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'dateTime', required };
}

function selectField(logicalName: string, displayName: string, options: readonly string[], required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'singleSelect', options, required };
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

function toLarkFieldJson(field: PmsBaseFieldSpec): Record<string, unknown> {
  return {
    name: field.displayName,
    type: toLarkFieldType(field.kind),
    ...(field.options ? { options: field.options.map((option) => ({ name: option })) } : {}),
  };
}

function toLarkFieldType(kind: PmsBaseFieldKind): string {
  if (kind === 'singleSelect') return 'select';
  if (kind === 'dateTime') return 'datetime';
  if (kind === 'longText') return 'text';
  return kind;
}

function toLarkViewJson(view: PmsBaseViewSpec): Record<string, unknown> {
  return {
    name: view.displayName,
    type: view.kind,
  };
}

function toRecordBatchJson(table: PmsBaseTableSpec): Record<string, unknown> {
  const fields = table.fields.map((field) => field.displayName);
  return {
    fields,
    rows: table.seedRecords.map((record) => fields.map((field) => record.fields[field] ?? null)),
  };
}

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseTableLogicalName): PmsBaseTableSpec {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  if (!table) {
    throw new Error(`table_missing:${logicalName}`);
  }
  return table;
}

function findTrackedTargetValues(value: unknown, path = ''): string[] {
  const errors: string[] = [];
  if (typeof value === 'string') {
    if (looksLikeTrackedTargetValue(value)) {
      errors.push(`tracked_target_value_forbidden:${path}`);
    }
    return errors;
  }
  if (!value || typeof value !== 'object') {
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => errors.push(...findTrackedTargetValues(entry, `${path}[${index}]`)));
    return errors;
  }
  for (const [key, entry] of Object.entries(value)) {
    errors.push(...findTrackedTargetValues(entry, path ? `${path}.${key}` : key));
  }
  return errors;
}

function looksLikeTrackedTargetValue(value: string): boolean {
  return /\b(?:app_token|base_token|table_id|field_id|view_id|form_id|record_id)\b/i.test(value)
    || /\b(?:bascn|tbl|fld|vew|frm)[a-zA-Z0-9_/-]{6,}\b/.test(value);
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function envRef(name: string): string {
  return `$${name}`;
}

function envNameFromRef(ref: string): string {
  return ref.startsWith('$') ? ref.slice(1) : ref;
}

function materializeEnvRefs(command: readonly string[], envRefs: readonly string[]): readonly string[] {
  if (envRefs.length === 0) {
    return command;
  }
  return command.map((part) => {
    if (!part.startsWith('$')) {
      return part;
    }
    const envName = part.slice(1);
    if (!envRefs.includes(envName)) {
      return part;
    }
    return process.env[envName] ?? part;
  });
}

async function defaultLarkCliRunner(command: readonly string[]): Promise<LarkCliRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message,
      });
    });
  });
}

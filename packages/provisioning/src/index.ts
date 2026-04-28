import { spawn } from 'node:child_process';

export const pmsBaseProvisioningSchemaVersion = 'pms-base-provisioning-v1';
export const pmsBaseProjectionSchemaVersion = 'pms-dashboard-mvp-v1';

export type PmsBaseTableLogicalName = 'RoomLedger' | 'OperationRequests' | 'HousekeepingTasks' | 'OperationLogs';
export type PmsBaseFieldKind = 'text' | 'longText' | 'singleSelect' | 'dateTime' | 'number';
export type PmsBaseWorkflow = 'CHECK_IN' | 'CHECK_OUT';
export type OperationRequestStrategy = 'adapterUpsert' | 'seedRows' | 'managedForm';
export type LarkCliProvisioningMode = 'dryRun' | 'apply';

export interface HotelRoomStatusProfile {
  readonly occupancyStatus: 'Vacant' | 'InHouse' | 'DueOut';
  readonly cleaningStatus: 'Clean' | 'Dirty' | 'Cleaning' | 'Inspection';
  readonly sellableStatus: 'Sellable' | 'StopSell';
}

export interface HotelRoomProfile {
  readonly roomNumber: string;
  readonly roomType: string;
  readonly floor: string;
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
  readonly kind: 'grid' | 'kanban' | 'form';
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
  'OperationLogs',
];

const requiredOperationRequestFields = [
  'ClientToken',
  'Action',
  'Status',
  'RoomNumber',
  'Operator',
  'Reason',
  'RequestedAt',
  'PayloadJSON',
  'ResultJSON',
  'SchemaVersion',
] as const;

export const smallHotelProfileFixture: HotelProfile = {
  propertyKey: 'sandbox-pms-base-n5',
  propertyName: 'Sandbox PMS Base',
  baseDisplayName: 'Sandbox PMS Base - N5 Proof',
  timeZone: 'Asia/Shanghai',
  proofRoomNumbers: ['0308', '1001'],
  enabledWorkflows: ['CHECK_IN', 'CHECK_OUT'],
  operationRequestStrategy: 'adapterUpsert',
  dashboardFeatures: ['frontDeskDashboard', 'roomLedger', 'operationRequests', 'housekeepingQueue', 'operationLogs'],
  rooms: [
    {
      roomNumber: '0308',
      roomType: 'standard',
      floor: '03',
      zone: 'east',
      initialStatus: {
        occupancyStatus: 'Vacant',
        cleaningStatus: 'Clean',
        sellableStatus: 'Sellable',
      },
    },
    {
      roomNumber: '1001',
      roomType: 'deluxe',
      floor: '10',
      zone: 'west',
      initialStatus: {
        occupancyStatus: 'DueOut',
        cleaningStatus: 'Clean',
        sellableStatus: 'Sellable',
      },
    },
  ],
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
      roomType: index === 0 ? 'standard' : 'deluxe',
      floor: roomNumber.slice(0, Math.max(1, roomNumber.length - 2)).padStart(2, '0'),
      zone: index === 0 ? 'east' : 'west',
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
      operationLogsTable(),
    ],
    forms: [
      {
        logicalName: 'operation-request-intake',
        displayName: 'PMS Operation Request Intake',
        tableLogicalName: 'OperationRequests',
        description: 'Managed sandbox intake form for PMS OperationRequest projection.',
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
              roomNumber: 'RoomNumber',
              roomType: 'RoomType',
              occupancyStatus: 'OccupancyStatus',
              cleaningStatus: 'CleaningStatus',
              sellableStatus: 'SellableStatus',
              roomCode: 'RoomCode',
              currentReservationCode: 'CurrentReservationCode',
              lastOperator: 'LastOperator',
              lastReason: 'LastReason',
              lastUpdatedAt: 'LastUpdatedAt',
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
              'occupancyStatus',
              'cleaningStatus',
              'sellableStatus',
              'roomCode',
              'currentReservationCode',
              'lastOperator',
              'lastReason',
              'lastUpdatedAt',
            ],
          },
          operationRequests: {
            tableLogicalName: 'OperationRequests',
            fieldMap: {
              clientToken: 'ClientToken',
              action: 'Action',
              status: 'Status',
              roomNumber: 'RoomNumber',
              operator: 'Operator',
              reason: 'Reason',
              requestedAt: 'RequestedAt',
              payloadJSON: 'PayloadJSON',
              resultJSON: 'ResultJSON',
              schemaVersion: 'SchemaVersion',
            },
            requiredFields: ['clientToken', 'action', 'status', 'roomNumber', 'operator', 'reason', 'requestedAt', 'schemaVersion'],
            updateAllowedFields: ['status', 'resultJSON', 'schemaVersion'],
          },
          operationLogs: {
            tableLogicalName: 'OperationLogs',
            fieldMap: {
              auditId: 'AuditId',
              commandType: 'CommandType',
              roomNumber: 'RoomNumber',
              actor: 'Actor',
              source: 'Source',
              reason: 'Reason',
              idempotencyKey: 'IdempotencyKey',
              correlationId: 'CorrelationId',
              occurredAt: 'OccurredAt',
              domainEventTypes: 'DomainEventTypes',
              payloadJSON: 'PayloadJSON',
              schemaVersion: 'SchemaVersion',
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
      .map((record) => stringValue(record.fields.RoomNumber))
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
      `${spec.profile.propertyName} Dashboard`,
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
    displayName: 'Room Ledger',
    fields: [
      textField('roomNumber', 'RoomNumber'),
      textField('roomType', 'RoomType'),
      textField('floor', 'Floor'),
      textField('zone', 'Zone'),
      selectField('occupancyStatus', 'OccupancyStatus', ['Vacant', 'InHouse', 'DueOut']),
      selectField('cleaningStatus', 'CleaningStatus', ['Clean', 'Dirty', 'Cleaning', 'Inspection']),
      selectField('sellableStatus', 'SellableStatus', ['Sellable', 'StopSell']),
      textField('roomCode', 'RoomCode'),
      textField('currentReservationCode', 'CurrentReservationCode', false),
      textField('lastOperator', 'LastOperator'),
      textField('lastReason', 'LastReason'),
      dateTimeField('lastUpdatedAt', 'LastUpdatedAt'),
      textField('schemaVersion', 'SchemaVersion'),
    ],
    views: [
      { logicalName: 'frontdesk-all-rooms', displayName: 'Frontdesk All Rooms', kind: 'grid' },
      { logicalName: 'cleaning-queue', displayName: 'Cleaning Queue', kind: 'grid', filterHint: 'CleaningStatus in Dirty,Cleaning,Inspection' },
    ],
    seedRecords: profile.rooms.map((room) => ({
      logicalKey: `room:${room.roomNumber}`,
      fields: {
        RoomNumber: room.roomNumber,
        RoomType: room.roomType,
        Floor: room.floor,
        Zone: room.zone,
        OccupancyStatus: room.initialStatus.occupancyStatus,
        CleaningStatus: room.initialStatus.cleaningStatus,
        SellableStatus: room.initialStatus.sellableStatus,
        RoomCode: `${room.roomNumber}:${room.initialStatus.occupancyStatus}:${room.initialStatus.cleaningStatus}:${room.initialStatus.sellableStatus}`,
        CurrentReservationCode: null,
        LastOperator: 'provisioning-seed',
        LastReason: 'sandbox seed room',
        LastUpdatedAt: '2026-04-28T00:00:00.000Z',
        SchemaVersion: pmsBaseProjectionSchemaVersion,
      },
    })),
  };
}

function operationRequestsTable(profile: HotelProfile): PmsBaseTableSpec {
  return {
    logicalName: 'OperationRequests',
    displayName: 'PMS Operation Requests',
    fields: [
      textField('clientToken', 'ClientToken'),
      selectField('action', 'Action', ['CHECK_IN', 'CHECK_OUT']),
      selectField('status', 'Status', ['Pending', 'DryRunReady', 'Confirmed', 'Done', 'Failed', 'Expired', 'Duplicate']),
      textField('roomNumber', 'RoomNumber'),
      textField('operator', 'Operator'),
      textField('reason', 'Reason'),
      dateTimeField('requestedAt', 'RequestedAt'),
      longTextField('payloadJSON', 'PayloadJSON', false),
      longTextField('resultJSON', 'ResultJSON', false),
      textField('schemaVersion', 'SchemaVersion'),
    ],
    views: [
      { logicalName: 'pending-operations', displayName: 'Pending Operations', kind: 'grid', filterHint: 'Status in Pending,DryRunReady,Confirmed' },
      { logicalName: 'failed-operations', displayName: 'Failed Operations', kind: 'grid', filterHint: 'Status = Failed' },
    ],
    seedRecords: profile.proofRoomNumbers.flatMap((roomNumber) =>
      profile.enabledWorkflows.map((workflow) => ({
        logicalKey: `operation:${workflow}:${roomNumber}`,
        fields: {
          ClientToken: `sandbox-${workflow.toLowerCase().replace('_', '-')}-${roomNumber}`,
          Action: workflow,
          Status: 'Pending',
          RoomNumber: roomNumber,
          Operator: 'provisioning-seed',
          Reason: `seed ${workflow} proof request`,
          RequestedAt: '2026-04-28T00:00:00.000Z',
          PayloadJSON: JSON.stringify({ workflow, roomNumber }),
          ResultJSON: null,
          SchemaVersion: pmsBaseProjectionSchemaVersion,
        },
      })),
    ),
    upsertPolicy: {
      strategy: profile.operationRequestStrategy,
      uniqueField: 'ClientToken',
      createOnMissing: profile.operationRequestStrategy === 'adapterUpsert',
      updateAllowedFields: ['Status', 'ResultJSON', 'SchemaVersion'],
    },
  };
}

function housekeepingTasksTable(): PmsBaseTableSpec {
  return {
    logicalName: 'HousekeepingTasks',
    displayName: 'Housekeeping Tasks',
    fields: [
      textField('taskId', 'TaskId'),
      textField('roomNumber', 'RoomNumber'),
      selectField('kind', 'Kind', ['checkout-cleaning', 'maintenance-followup']),
      selectField('status', 'Status', ['pending', 'inProgress', 'done', 'cancelled']),
      textField('reason', 'Reason'),
      textField('correlationId', 'CorrelationId'),
      dateTimeField('createdAt', 'CreatedAt'),
      dateTimeField('completedAt', 'CompletedAt', false),
      textField('schemaVersion', 'SchemaVersion'),
    ],
    views: [{ logicalName: 'active-housekeeping', displayName: 'Active Housekeeping', kind: 'grid' }],
    seedRecords: [],
  };
}

function operationLogsTable(): PmsBaseTableSpec {
  return {
    logicalName: 'OperationLogs',
    displayName: 'Operation Logs',
    fields: [
      textField('auditId', 'AuditId'),
      selectField('commandType', 'CommandType', ['CHECK_IN', 'CHECK_OUT', 'HOUSEKEEPING_DONE', 'REPORT_MAINTENANCE']),
      textField('roomNumber', 'RoomNumber'),
      textField('actor', 'Actor'),
      textField('source', 'Source'),
      textField('reason', 'Reason'),
      textField('idempotencyKey', 'IdempotencyKey'),
      textField('correlationId', 'CorrelationId'),
      dateTimeField('occurredAt', 'OccurredAt'),
      longTextField('domainEventTypes', 'DomainEventTypes'),
      longTextField('payloadJSON', 'PayloadJSON', false),
      textField('schemaVersion', 'SchemaVersion'),
    ],
    views: [{ logicalName: 'recent-operation-logs', displayName: 'Recent Operation Logs', kind: 'grid' }],
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
    roomType: normalizeRequiredString(room.roomType, index === 0 ? 'standard' : 'deluxe'),
    floor: normalizeRequiredString(room.floor, roomNumber.slice(0, Math.max(1, roomNumber.length - 2)).padStart(2, '0')),
    zone: normalizeRequiredString(room.zone, index === 0 ? 'east' : 'west'),
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
  return [...new Set(values)].filter((value): value is PmsBaseWorkflow => value === 'CHECK_IN' || value === 'CHECK_OUT');
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

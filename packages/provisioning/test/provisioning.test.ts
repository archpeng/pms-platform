import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildLarkCliProvisioningPlan,
  createSmallHotelPmsBaseProvisioningSpec,
  executeLarkCliProvisioningPlan,
  normalizeHotelProfileCandidate,
  parseHotelProfileCandidateFromText,
  pmsBaseProvisioningSchemaVersion,
  smallHotelProfileFixture,
  validatePmsBaseProvisioningSpec,
  type HotelProfile,
  type PmsBaseProvisioningSpec,
} from '../src/index.js';

describe('PMS Base provisioning contract and generator', () => {
  it('generates a deterministic Chinese PMS-owned spec with fixed small-hotel rooms and OperationRequest schema', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);

    expect(spec.schemaVersion).toBe(pmsBaseProvisioningSchemaVersion);
    expect(spec.base.displayName).toBe('酒店房态管理');
    expect(spec.base.timeZone).toBe('Asia/Shanghai');
    expect(spec.proof.proofRoomNumbers).toEqual(['A1', 'A2']);
    expect(spec.tables.map((table) => table.logicalName)).toEqual([
      'RoomLedger',
      'OperationRequests',
      'HousekeepingTasks',
      'MaintenanceTickets',
      'Reservations',
      'Stays',
      'OperationLogs',
      'InventoryCalendar',
      'ProjectionStatus',
    ]);
    expect(spec.tables.map((table) => table.displayName)).toEqual([
      '房态台账',
      'PMS操作请求',
      '保洁任务',
      '维修工单',
      '预订',
      '入住记录',
      '操作日志',
      '库存日历',
      '投影状态',
    ]);

    const operationRequests = requiredTable(spec, 'OperationRequests');
    expect(operationRequests.fields.map((field) => field.displayName)).toEqual([
      '后端ID',
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
    ]);
    expect(operationRequests.upsertPolicy).toEqual({
      strategy: 'adapterUpsert',
      uniqueField: '请求令牌',
      createOnMissing: true,
      updateAllowedFields: ['操作状态', '结果JSON', '版本'],
    });
    expect(operationRequests.fields.find((field) => field.logicalName === 'action')).toMatchObject({
      options: expect.arrayContaining(['RESERVATION_WORKFLOW', 'RESERVATION_GROUP_WORKFLOW']),
    });
    expect(operationRequests.fields.find((field) => field.logicalName === 'status')).toMatchObject({
      options: expect.arrayContaining(['已取消']),
    });

    const roomLedger = requiredTable(spec, 'RoomLedger');
    expect(roomLedger.fields.map((field) => field.displayName)).not.toContain('Floor');
    expect(roomLedger.fields.map((field) => field.displayName)).not.toContain('楼层');
    expect(roomLedger.seedRecords.map((record) => record.fields['房号'])).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'E1',
      'E2',
    ]);
    expect(Object.fromEntries(roomLedger.seedRecords.map((record) => [record.fields['房号'], record.fields['房型']]))).toEqual({
      A1: '花园别墅',
      A2: '花园别墅',
      B1: '花园别墅',
      B2: '花园别墅',
      C1: '花园别墅',
      C2: '花园套房',
      D1: '秘境洞穴',
      D2: '秘境洞穴',
      D3: '秘境洞穴',
      D4: '秘境洞穴',
      D5: '秘境洞穴',
      E1: '花园套房',
      E2: '花园别墅',
    });
    expect(roomLedger.seedRecords.every((record) =>
      record.fields['入住状态'] === '空房' &&
      record.fields['清洁状态'] === '干净' &&
      record.fields['可售状态'] === '可售',
    )).toBe(true);

    const inventoryCalendar = requiredTable(spec, 'InventoryCalendar');
    expect(inventoryCalendar.fields.map((field) => field.displayName)).toEqual([
      '后端ID',
      '库存区间键',
      '门店ID',
      '房间ID',
      '房号',
      '关联房间',
      '房型ID',
      '房型',
      '开始日期',
      '结束日期',
      '日历状态',
      '可售状态',
      '标题',
      '来源JSON',
      '投影状态',
      '剪枝时间',
      '更新时间',
      '版本',
    ]);
    expect(inventoryCalendar.views.map((view) => [view.displayName, view.kind])).toEqual([
      ['库存日历', 'gantt'],
      ['库存明细', 'grid'],
      ['月历概览', 'calendar'],
    ]);
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.roomLedger.tableLogicalName).toBe('RoomLedger');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.roomLedger.fieldMap.roomNumber).toBe('房号');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.roomLedger.fieldMap.occupancyStatus).toBe('入住状态');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.operationRequests.tableLogicalName).toBe('OperationRequests');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.inventoryCalendar.tableLogicalName).toBe('InventoryCalendar');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.inventoryCalendar.fieldMap.intervalKey).toBe('库存区间键');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.operationLogs.tableLogicalName).toBe('OperationLogs');

    const stays = requiredTable(spec, 'Stays');
    expect(stays.fields.map((field) => field.displayName)).toEqual([
      '后端ID',
      '预订号',
      '房号',
      '关联房间',
      '入住状态',
      '入住时间',
      '离店时间',
      '版本',
    ]);
    expect(stays.fields.find((field) => field.displayName === '后端ID')).toMatchObject({ kind: 'text', hidden: true, required: false });
    expect(stays.fields.find((field) => field.displayName === '关联房间')).toMatchObject({
      logicalName: 'relatedRoom',
      kind: 'linkedRecord',
      required: false,
      linkedRecord: {
        targetTableLogicalName: 'RoomLedger',
        targetDisplayFieldName: '房号',
        cardinality: 'single',
        configMode: 'symbolic',
      },
    });
    expect(stays.upsertPolicy).toEqual({
      strategy: 'adapterUpsert',
      uniqueField: '后端ID',
      createOnMissing: true,
      updateAllowedFields: ['预订号', '房号', '关联房间', '入住状态', '入住时间', '离店时间', '版本'],
    });
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.stays).toMatchObject({
      tableLogicalName: 'Stays',
      fieldMap: {
        backendId: '后端ID',
        reservationCode: '预订号',
        roomNumber: '房号',
        relatedRoom: '关联房间',
        status: '入住状态',
        checkedInAt: '入住时间',
        checkedOutAt: '离店时间',
        schemaVersion: '版本',
      },
      requiredFields: ['backendId', 'reservationCode', 'roomNumber', 'status', 'checkedInAt', 'schemaVersion'],
      updateAllowedFields: ['reservationCode', 'roomNumber', 'relatedRoom', 'status', 'checkedInAt', 'checkedOutAt', 'schemaVersion'],
    });

    const projectionStatus = requiredTable(spec, 'ProjectionStatus');
    expect(projectionStatus.fields.map((field) => field.displayName)).toEqual([
      '后端ID',
      '投影名称',
      '聚合键',
      '状态',
      '尝试次数',
      '最近投影时间',
      '错误摘要',
      '更新时间',
      '版本',
    ]);
    expect(projectionStatus.fields.find((field) => field.displayName === '后端ID')).toMatchObject({ kind: 'text', hidden: true, required: false });
    expect(projectionStatus.fields.find((field) => field.displayName === '尝试次数')).toMatchObject({ kind: 'number', required: true });
    expect(projectionStatus.upsertPolicy).toEqual({
      strategy: 'adapterUpsert',
      uniqueField: '后端ID',
      createOnMissing: true,
      updateAllowedFields: ['投影名称', '聚合键', '状态', '尝试次数', '最近投影时间', '错误摘要', '更新时间', '版本'],
    });
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.projectionStatus).toMatchObject({
      tableLogicalName: 'ProjectionStatus',
      fieldMap: {
        backendId: '后端ID',
        projectionName: '投影名称',
        aggregateKey: '聚合键',
        status: '状态',
        attemptCount: '尝试次数',
        lastProjectedAt: '最近投影时间',
        lastErrorSummary: '错误摘要',
        updatedAt: '更新时间',
        schemaVersion: '版本',
      },
      requiredFields: ['backendId', 'projectionName', 'aggregateKey', 'status', 'attemptCount', 'updatedAt', 'schemaVersion'],
    });
    expect(validatePmsBaseProvisioningSpec(spec)).toEqual([]);
  });

  it('models D4A hidden canonical IDs and symbolic linked-record fields without real targets', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const canonicalTables: PmsBaseProvisioningSpec['tables'][number]['logicalName'][] = [
      'RoomLedger',
      'OperationRequests',
      'HousekeepingTasks',
      'MaintenanceTickets',
      'Reservations',
      'Stays',
      'OperationLogs',
      'InventoryCalendar',
      'ProjectionStatus',
    ];

    for (const tableName of canonicalTables) {
      const backendId = requiredTable(spec, tableName).fields.find((field) => field.displayName === '后端ID');
      expect(backendId).toMatchObject({ logicalName: 'backendId', kind: 'text', hidden: true, required: false });
    }

    expect(requiredTable(spec, 'HousekeepingTasks').fields.find((field) => field.displayName === '关联房间')).toMatchObject({
      logicalName: 'relatedRoom',
      kind: 'linkedRecord',
      required: false,
      linkedRecord: {
        targetTableLogicalName: 'RoomLedger',
        targetDisplayFieldName: '房号',
        cardinality: 'single',
        configMode: 'symbolic',
      },
    });
    expect(requiredTable(spec, 'OperationLogs').fields.find((field) => field.displayName === '关联操作请求')).toMatchObject({
      logicalName: 'relatedOperationRequest',
      kind: 'linkedRecord',
      required: false,
      linkedRecord: {
        targetTableLogicalName: 'OperationRequests',
        targetDisplayFieldName: '请求令牌',
        cardinality: 'single',
        configMode: 'symbolic',
      },
    });

    expect(requiredTable(spec, 'RoomLedger').fields.map((field) => field.displayName)).toContain('房号');
    expect(requiredTable(spec, 'OperationRequests').fields.map((field) => field.displayName)).toContain('请求令牌');
    expect(requiredTable(spec, 'HousekeepingTasks').fields.map((field) => field.displayName)).toContain('任务ID');
    expect(requiredTable(spec, 'MaintenanceTickets').fields.map((field) => field.displayName)).toContain('工单ID');
    expect(requiredTable(spec, 'Reservations').fields.map((field) => field.displayName)).toContain('预订号');
    expect(requiredTable(spec, 'Stays').fields.map((field) => field.displayName)).toEqual(expect.arrayContaining(['预订号', '房号', '关联房间', '入住状态', '入住时间', '离店时间']));
    expect(requiredTable(spec, 'InventoryCalendar').fields.map((field) => field.displayName)).toContain('库存区间键');
    expect(requiredTable(spec, 'OperationLogs').fields.map((field) => field.displayName)).toContain('审计ID');
    expect(JSON.stringify(spec)).not.toMatch(/tbl[a-zA-Z0-9]|bascn|app_token|record_id|form_id/);
  });

  it('rejects D6B projection status schema drift and tracked target placeholders', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const invalid: PmsBaseProvisioningSpec = {
      ...spec,
      tables: spec.tables.map((table) =>
        table.logicalName === 'ProjectionStatus'
          ? {
              ...table,
              fields: table.fields
                .filter((field) => field.displayName !== '错误摘要')
                .map((field) => field.displayName === '后端ID' ? { ...field, hidden: false } : field),
              upsertPolicy: undefined,
            }
          : table,
      ),
      adapterRegistryBindings: {
        ...spec.adapterRegistryBindings,
        pmsBaseProjection: {
          ...spec.adapterRegistryBindings.pmsBaseProjection,
          bindings: {
            ...spec.adapterRegistryBindings.pmsBaseProjection.bindings,
            projectionStatus: {
              ...spec.adapterRegistryBindings.pmsBaseProjection.bindings.projectionStatus,
              tableLogicalName: 'tbl123_real_status_table' as never,
            },
          },
        },
      },
    };

    expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
      expect.arrayContaining([
        'canonical_id_field_not_hidden:ProjectionStatus:后端ID',
        'projection_status_field_missing:错误摘要',
        'projection_status_upsert_policy_required',
        'tracked_target_value_forbidden:adapterRegistryBindings.pmsBaseProjection.bindings.projectionStatus.tableLogicalName',
      ]),
    );
  });

  it('keeps natural-language/LLM parsing advisory and validates the normalized profile before generation', () => {
    const candidate = parseHotelProfileCandidateFromText('Build a small hotel sandbox in Asia/Shanghai with rooms 0308 and 1001 for check-in and check-out proof.');
    const profile = normalizeHotelProfileCandidate(candidate);

    expect(profile).toMatchObject({
      propertyKey: 'sandbox-pms-base-n5',
      timeZone: 'Asia/Shanghai',
      proofRoomNumbers: ['0308', '1001'],
      enabledWorkflows: ['CHECK_IN', 'CHECK_OUT'],
    });
    expect(createSmallHotelPmsBaseProvisioningSpec(profile).proof.proofRoomNumbers).toEqual(['0308', '1001']);
  });

  it('rejects invalid specs before Feishu execution', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const invalid: PmsBaseProvisioningSpec = {
      ...spec,
      proof: {
        ...spec.proof,
        proofRoomNumbers: ['0308'],
      },
      tables: spec.tables.map((table) =>
        table.logicalName === 'OperationRequests'
          ? {
              ...table,
              fields: [
                ...table.fields,
                {
                  logicalName: 'duplicateStatus',
                  displayName: '操作状态',
                  kind: 'singleSelect',
                  required: true,
                },
              ],
              upsertPolicy: undefined,
            }
          : table,
      ),
      adapterRegistryBindings: {
        ...spec.adapterRegistryBindings,
        pmsBaseProjection: {
          ...spec.adapterRegistryBindings.pmsBaseProjection,
          targetPolicy: {
            ...spec.adapterRegistryBindings.pmsBaseProjection.targetPolicy,
            exampleTargetHint: 'tbl123_real_looking_value',
          },
        },
      },
    };

    expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
      expect.arrayContaining([
        'proof_room_pair_required',
        'duplicate_field_display_name:OperationRequests:操作状态',
        'proof_room_seed_missing:0308',
        'operation_requests_upsert_policy_required',
        'tracked_target_value_forbidden:adapterRegistryBindings.pmsBaseProjection.targetPolicy.exampleTargetHint',
      ]),
    );
  });

  it('rejects D4A schema drift for canonical IDs and placeholder-only linked records', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const invalid: PmsBaseProvisioningSpec = {
      ...spec,
      tables: spec.tables.map((table) => {
        if (table.logicalName === 'OperationRequests') {
          return {
            ...table,
            fields: table.fields.filter((field) => field.displayName !== '后端ID'),
          };
        }
        if (table.logicalName === 'HousekeepingTasks') {
          return {
            ...table,
            fields: table.fields.map((field) =>
              field.displayName === '关联房间'
                ? { ...field, kind: 'text', linkedRecord: undefined }
                : field,
            ),
          };
        }
        if (table.logicalName === 'Reservations') {
          return {
            ...table,
            fields: table.fields.filter((field) => field.displayName !== '关联房间'),
          };
        }
        if (table.logicalName === 'OperationLogs') {
          return {
            ...table,
            fields: table.fields.map((field) =>
              field.displayName === '关联操作请求'
                ? { ...field, required: true }
                : field,
            ),
          };
        }
        if (table.logicalName === 'InventoryCalendar') {
          return {
            ...table,
            fields: table.fields.map((field) =>
              field.displayName === '关联房间'
                ? {
                    ...field,
                    linkedRecord: {
                      targetTableLogicalName: 'tbl123_real_target' as never,
                      targetDisplayFieldName: 'rec_room_1',
                      cardinality: 'single',
                      configMode: 'symbolic',
                    },
                  }
                : field,
            ),
          };
        }
        return table;
      }),
    };

    expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
      expect.arrayContaining([
        'canonical_id_field_missing:OperationRequests:后端ID',
        'linked_record_field_kind_invalid:HousekeepingTasks:关联房间',
        'linked_record_field_missing:Reservations:关联房间',
        'linked_record_field_must_be_optional:OperationLogs:关联操作请求',
        'linked_record_target_mismatch:InventoryCalendar:关联房间:RoomLedger',
        'tracked_target_value_forbidden:tables[7].fields[5].linkedRecord.targetTableLogicalName',
        'tracked_target_value_forbidden:tables[7].fields[5].linkedRecord.targetDisplayFieldName',
      ]),
    );
  });

  it('plans local lark-cli commands without mutating by default and gates apply mode explicitly', async () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const plan = buildLarkCliProvisioningPlan(spec, {
      mode: 'dryRun',
      profile: 'sandbox',
      folderTokenEnv: 'FEISHU_SANDBOX_FOLDER_TOKEN',
    });

    expect(plan.mode).toBe('dryRun');
    expect(plan.operations.map((operation) => operation.kind)).toContain('base-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('table-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('field-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('view-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('record-batch-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('form-create');
    expect(plan.operations.every((operation) => operation.command.includes('--dry-run'))).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/tbl[a-zA-Z0-9]|bascn|rec_[a-zA-Z0-9_/-]{3,}|rec[a-zA-Z0-9]{12,}|app_token|record_id|form_id/);

    await expect(executeLarkCliProvisioningPlan(plan)).resolves.toMatchObject({
      mode: 'dryRun',
      executed: false,
    });

    const applyPlan = buildLarkCliProvisioningPlan(spec, {
      mode: 'apply',
      profile: 'sandbox',
      baseTokenEnv: 'FEISHU_SANDBOX_BASE_TOKEN',
      allowApply: false,
    });
    await expect(executeLarkCliProvisioningPlan(applyPlan, { runner: vi.fn() })).rejects.toThrow(/apply_not_allowed/);

    const runner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '{}', stderr: '' });
    const allowedApplyPlan = buildLarkCliProvisioningPlan(spec, {
      mode: 'apply',
      profile: 'sandbox',
      baseTokenEnv: 'FEISHU_SANDBOX_BASE_TOKEN',
      allowApply: true,
    });
    await expect(executeLarkCliProvisioningPlan(allowedApplyPlan, { runner })).resolves.toMatchObject({
      mode: 'apply',
      executed: true,
      operationCount: allowedApplyPlan.operations.length,
    });
    expect(runner).toHaveBeenCalledTimes(allowedApplyPlan.operations.length);
  });

  it('supports bot-profile second phase plans for an already-created Base', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const plan = buildLarkCliProvisioningPlan(spec, {
      mode: 'apply',
      profile: 'pms-platform-bot',
      identity: 'bot',
      baseTokenEnv: 'PMS_BASE_PROVISIONING_BASE_TOKEN',
      includeBaseCreate: false,
      allowApply: true,
    });

    expect(plan.operations.map((operation) => operation.kind)).not.toContain('base-create');
    expect(plan.operations.map((operation) => operation.kind)).toContain('table-create');
    expect(plan.operations.every((operation) => {
      const asIndex = operation.command.indexOf('--as');
      return asIndex > -1 && operation.command[asIndex + 1] === 'bot';
    })).toBe(true);
    expect(plan.operations.every((operation) => {
      const profileIndex = operation.command.indexOf('--profile');
      return profileIndex > -1 && operation.command[profileIndex + 1] === 'pms-platform-bot';
    })).toBe(true);
  });

  it('maps PMS field kinds to lark-cli Base field JSON', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const plan = buildLarkCliProvisioningPlan(spec, {
      mode: 'dryRun',
      includeBaseCreate: false,
    });
    const fieldJson = (logicalName: string) => {
      const operation = plan.operations.find((entry) => entry.kind === 'field-create' && entry.logicalName === logicalName);
      expect(operation).toBeDefined();
      return JSON.parse(operation!.command[operation!.command.indexOf('--json') + 1]) as Record<string, unknown>;
    };

    expect(fieldJson('RoomLedger.occupancyStatus')).toEqual({
      name: '入住状态',
      type: 'select',
      options: [{ name: '空房' }, { name: '在住' }, { name: '预离' }],
    });
    expect(fieldJson('RoomLedger.lastUpdatedAt')).toMatchObject({
      name: '更新时间',
      type: 'datetime',
    });
    expect(fieldJson('RoomLedger.lastReason')).toMatchObject({
      name: '最后原因',
      type: 'text',
    });
    expect(fieldJson('RoomLedger.backendId')).toMatchObject({
      name: '后端ID',
      type: 'text',
      hidden: true,
    });
    expect(fieldJson('HousekeepingTasks.relatedRoom')).toEqual({
      name: '关联房间',
      type: 'link',
      relation: {
        targetTableLogicalName: 'RoomLedger',
        targetDisplayFieldName: '房号',
        cardinality: 'single',
        configMode: 'symbolic',
      },
    });
    expect(JSON.stringify(fieldJson('HousekeepingTasks.relatedRoom'))).not.toMatch(/tbl[a-zA-Z0-9]|bascn|rec_[a-zA-Z0-9_/-]{3,}|rec[a-zA-Z0-9]{12,}|app_token|record_id|form_id/);
  });

  it('uses a lark-cli supported dashboard theme', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
    const plan = buildLarkCliProvisioningPlan(spec, {
      mode: 'dryRun',
      includeBaseCreate: false,
    });
    const dashboard = plan.operations.find((operation) => operation.kind === 'dashboard-create');

    expect(dashboard).toBeDefined();
    expect(dashboard!.command).toContain('--theme-style');
    expect(dashboard!.command[dashboard!.command.indexOf('--theme-style') + 1]).toBe('default');
  });

  it('keeps PMS core/contracts free of Feishu SDK and adapter imports', () => {
    const files = [
      resolve(import.meta.dirname, '../../contracts/src/index.ts'),
      resolve(import.meta.dirname, '../../core/src/index.ts'),
    ];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/@larksuite|adapter-feishu|lark-cli|bitable/i);
    }
  });
});

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseProvisioningSpec['tables'][number]['logicalName']) {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  expect(table).toBeDefined();
  return table!;
}

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

describe('PMS Base provisioning contract and generator - provisioning-spec', () => {
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
  
    
});

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseProvisioningSpec['tables'][number]['logicalName']) {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  expect(table).toBeDefined();
  return table!;
}

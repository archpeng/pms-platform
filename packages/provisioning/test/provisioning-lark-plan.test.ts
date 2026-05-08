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

describe('PMS Base provisioning contract and generator - provisioning-lark-plan', () => {
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
  
    
});

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseProvisioningSpec['tables'][number]['logicalName']) {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  expect(table).toBeDefined();
  return table!;
}

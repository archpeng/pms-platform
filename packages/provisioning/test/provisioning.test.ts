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
  it('generates a deterministic PMS-owned spec with N5 proof rooms and OperationRequest schema', () => {
    const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);

    expect(spec.schemaVersion).toBe(pmsBaseProvisioningSchemaVersion);
    expect(spec.base.displayName).toBe('Sandbox PMS Base - N5 Proof');
    expect(spec.base.timeZone).toBe('Asia/Shanghai');
    expect(spec.proof.proofRoomNumbers).toEqual(['0308', '1001']);
    expect(spec.tables.map((table) => table.logicalName)).toEqual([
      'RoomLedger',
      'OperationRequests',
      'HousekeepingTasks',
      'OperationLogs',
    ]);

    const operationRequests = requiredTable(spec, 'OperationRequests');
    expect(operationRequests.fields.map((field) => field.displayName)).toEqual([
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
    ]);
    expect(operationRequests.upsertPolicy).toEqual({
      strategy: 'adapterUpsert',
      uniqueField: 'ClientToken',
      createOnMissing: true,
      updateAllowedFields: ['Status', 'ResultJSON', 'SchemaVersion'],
    });

    const roomLedger = requiredTable(spec, 'RoomLedger');
    expect(roomLedger.seedRecords.map((record) => record.fields.RoomNumber)).toEqual(['0308', '1001']);
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.roomLedger.tableLogicalName).toBe('RoomLedger');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.operationRequests.tableLogicalName).toBe('OperationRequests');
    expect(spec.adapterRegistryBindings.pmsBaseProjection.bindings.operationLogs.tableLogicalName).toBe('OperationLogs');
    expect(validatePmsBaseProvisioningSpec(spec)).toEqual([]);
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
                  displayName: 'Status',
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
        'duplicate_field_display_name:OperationRequests:Status',
        'operation_requests_upsert_policy_required',
        'tracked_target_value_forbidden:adapterRegistryBindings.pmsBaseProjection.targetPolicy.exampleTargetHint',
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
    expect(JSON.stringify(plan)).not.toMatch(/tbl[a-zA-Z0-9]|bascn|app_token|record_id|form_id/);

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
      profile: 'ai-pms-new-bot',
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
      return profileIndex > -1 && operation.command[profileIndex + 1] === 'ai-pms-new-bot';
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
      name: 'OccupancyStatus',
      type: 'select',
      options: [{ name: 'Vacant' }, { name: 'InHouse' }, { name: 'DueOut' }],
    });
    expect(fieldJson('RoomLedger.lastUpdatedAt')).toMatchObject({
      name: 'LastUpdatedAt',
      type: 'datetime',
    });
    expect(fieldJson('RoomLedger.lastReason')).toMatchObject({
      name: 'LastReason',
      type: 'text',
    });
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

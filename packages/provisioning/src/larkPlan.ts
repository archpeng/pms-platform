import type { LarkCliProvisioningMode, PmsBaseProvisioningSpec } from './schema.js';
import { envNameFromRef, envRef, requiredTable, toLarkFieldJson, toLarkViewJson, toRecordBatchJson } from './larkJson.js';

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

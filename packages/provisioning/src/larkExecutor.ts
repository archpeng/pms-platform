import { spawn } from 'node:child_process';
import { materializeEnvRefs } from './larkJson.js';
import type { ExecuteLarkCliProvisioningPlanOptions, ExecuteLarkCliProvisioningPlanResult, LarkCliProvisioningPlan, LarkCliRunResult } from './larkPlan.js';

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

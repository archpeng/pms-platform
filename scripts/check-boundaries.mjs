#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const dependencyBuckets = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const sourceRoots = ['packages', 'scripts'];
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.local']);
const sourceFilePattern = /\.(?:mjs|cjs|js|ts|tsx)$/;

const forbiddenPackages = [
  { label: '@mariozechner/pi-agent-core', matches: (name) => name === '@mariozechner/pi-agent-core' || name.startsWith('@mariozechner/pi-agent-core/') },
  { label: '@mariozechner/pi-ai', matches: (name) => name === '@mariozechner/pi-ai' || name.startsWith('@mariozechner/pi-ai/') },
  { label: '@mariozechner/pi-coding-agent', matches: (name) => name === '@mariozechner/pi-coding-agent' || name.startsWith('@mariozechner/pi-coding-agent/') },
  { label: '@larksuiteoapi/* Feishu SDK', matches: (name) => name === '@larksuiteoapi/node-sdk' || name.startsWith('@larksuiteoapi/') },
];

const requiredAgentSnippets = [
  'pms-platform` owns PMS domain truth',
  'persistence',
  'state transitions',
  'read models',
  'audits',
  'idempotency',
  'business invariants',
  'does not own Pi/LLM runtime or semantic routing',
  'does not own Feishu conversation routing',
  'operation-request read/list APIs must be typed PMS read models',
  'not generic customer-chat projection surfaces',
  'AI maintainability boundaries',
  'packages/core/src/index.ts` remains a compatibility re-export entrypoint only',
  'packages/core/src/model.ts` owns room aggregate modeling',
  'packages/core/src/ports.ts` owns core repository',
  'packages/core/src/commands.ts` owns check-in, checkout',
  'packages/core/src/readModels.ts` owns PMS-owned room and dashboard read-model assembly',
  'packages/core/src/projections.ts` owns command projection assembly',
  'packages/core/src/inMemoryPorts.ts` owns replaceable in-memory core port implementations',
  'packages/api/src/index.ts` remains a compatibility re-export entrypoint only',
  'packages/api/src/commandApi.ts` owns PMS command API request/response mapping',
  'packages/api/src/readModelApi.ts` owns PMS read-model API request/response mapping',
  'packages/api/src/reservationWorkflowApi.ts` owns single-room reservation draft API contracts',
  'packages/api/src/reservationGroupWorkflowApi.ts` owns multi-room reservation group draft API contracts',
  'packages/api/src/pendingActionApi.ts` owns pending-action callback API contracts',
  'packages/api/src/operationRequestApi.ts` owns operation-request API contracts',
  'packages/api/src/fingerprint.ts` and `packages/api/src/idempotency.ts` own API fingerprint',
  'packages/api/src/localSandbox/httpHandler.ts` remains local HTTP auth/error orchestration',
  'httpHealthRoutes.ts`, `httpCommandRoutes.ts`, `httpReadRoutes.ts`, `httpWorkflowRoutes.ts`, `httpOperationRequestRoutes.ts`, `httpPendingActionRoutes.ts`, and `httpSandboxRoutes.ts` own their named local sandbox HTTP route families',
  'packages/api/src/sqliteSandboxStore.ts` remains the thin SQLite sandbox facade',
  'packages/api/src/sqliteSandbox/baseStore.ts` owns SQLite connection lifecycle',
  'packages/api/src/sqliteSandbox/coreStore.ts` owns room/catalog',
  'packages/api/src/sqliteSandbox/reservationStore.ts` owns reservation import/readback',
  'packages/api/src/sqliteSandbox/inventoryStore.ts` owns inventory rebuild',
  'packages/api/src/sqliteSandbox/workflowStore.ts` owns reservation draft/group draft state transitions',
  'packages/api/src/sqliteSandbox/workflowTablesStore.ts` owns reservation draft/group draft SQLite table persistence',
  'packages/api/src/sqliteSandbox/dispatchStore.ts` owns operation-request persistence',
  'packages/api/src/sqliteSandbox/schema.ts` owns SQLite DDL',
  'packages/api/src/sqliteSandbox/projectionOutbox.ts` owns projection outbox derivation',
  'packages/api/src/sqliteSandbox/model.ts` is a compatibility re-export',
  'packages/api/src/operations.ts` owns API operation names',
  'packages/api/src/capabilityManifest.ts` owns PMS capability manifest',
  'packages/provisioning/src/index.ts` remains a compatibility re-export entrypoint only',
  'packages/provisioning/src/schema.ts` owns PMS Base provisioning schema',
  'packages/provisioning/src/profile.ts` owns hotel profile fixtures',
  'packages/provisioning/src/spec.ts`, `packages/provisioning/src/tables.ts`, and `packages/provisioning/src/fields.ts` own PMS Base spec/table/field construction',
  'packages/provisioning/src/validation.ts` owns provisioning spec validation gates',
  'packages/provisioning/src/larkPlan.ts`, `packages/provisioning/src/larkJson.ts`, and `packages/provisioning/src/larkExecutor.ts` own lark-cli plan construction',
  'packages/contracts/src/reservationWorkflow.ts` owns reservation draft/group workflow',
  'packages/contracts/src/projectionOutbox.ts` owns PMS projection outbox contracts',
  'packages/contracts/src/fixtures.ts` owns shared contract/sample fixture constants',
];

const lineBudgetTargets = [
  { path: 'packages/core/src/index.ts', maxLines: 80, reason: 'Core public entrypoint must remain a compatibility re-export barrel' },
  { path: 'packages/core/src/model.ts', maxLines: 160, reason: 'Core model owner should stay focused on room state and pure model helpers' },
  { path: 'packages/core/src/ports.ts', maxLines: 90, reason: 'Core ports owner should only define repository/port contracts' },
  { path: 'packages/core/src/results.ts', maxLines: 180, reason: 'Core result owner should only define command result shapes' },
  { path: 'packages/core/src/commands.ts', maxLines: 1050, reason: 'Core command owner should not absorb read model, projection, or in-memory repository logic' },
  { path: 'packages/core/src/readModels.ts', maxLines: 120, reason: 'Core read model owner should stay focused on read-model assembly' },
  { path: 'packages/core/src/projections.ts', maxLines: 180, reason: 'Core projection owner should stay focused on command projection assembly' },
  { path: 'packages/core/src/inMemoryPorts.ts', maxLines: 260, reason: 'In-memory core ports owner should stay focused on test/local repository implementations' },
  { path: 'packages/api/src/index.ts', maxLines: 80, reason: 'API public entrypoint must remain a compatibility re-export barrel' },
  { path: 'packages/api/src/commandApi.ts', maxLines: 560, reason: 'API command owner should not absorb read-model or workflow APIs' },
  { path: 'packages/api/src/readModelApi.ts', maxLines: 180, reason: 'API read-model owner should stay focused on typed read-model routes' },
  { path: 'packages/api/src/availability.ts', maxLines: 160, reason: 'Availability API owner should stay focused on availability search derivation' },
  { path: 'packages/api/src/reservationWorkflowApi.ts', maxLines: 240, reason: 'Single-room reservation workflow API owner should stay bounded' },
  { path: 'packages/api/src/reservationGroupWorkflowApi.ts', maxLines: 240, reason: 'Group reservation workflow API owner should stay bounded' },
  { path: 'packages/api/src/pendingActionApi.ts', maxLines: 110, reason: 'Pending-action API owner should stay focused on callback contracts' },
  { path: 'packages/api/src/operationRequestApi.ts', maxLines: 140, reason: 'Operation-request API owner should stay focused on operation request contracts' },
  { path: 'packages/api/src/fingerprint.ts', maxLines: 120, reason: 'API fingerprint owner should stay focused on fingerprint envelopes and mismatch responses' },
  { path: 'packages/api/src/idempotency.ts', maxLines: 90, reason: 'API idempotency owner should stay focused on idempotency records and in-memory store' },
  { path: 'packages/api/src/boundary.ts', maxLines: 120, reason: 'API boundary owner should stay focused on contract boundary reporting' },
  { path: 'packages/api/src/localSandbox/httpHandler.ts', maxLines: 90, reason: 'Local sandbox HTTP handler must stay a thin auth/error route orchestrator' },
  { path: 'packages/api/src/localSandbox/httpHealthRoutes.ts', maxLines: 150, reason: 'Health/manifest route owner should stay focused on service status and capability manifest' },
  { path: 'packages/api/src/localSandbox/httpCommandRoutes.ts', maxLines: 100, reason: 'Command route owner should stay focused on check-in/out and extended commands' },
  { path: 'packages/api/src/localSandbox/httpReadRoutes.ts', maxLines: 220, reason: 'Read route owner should stay focused on PMS read models and availability derivation' },
  { path: 'packages/api/src/localSandbox/httpWorkflowRoutes.ts', maxLines: 117, reason: 'Workflow route owner dispatches reservation draft/group/cancel/adjust/create and guest ID-card archive/prepare/confirm routes' },
  { path: 'packages/api/src/localSandbox/httpOperationRequestRoutes.ts', maxLines: 80, reason: 'Operation-request route owner should stay focused on operation-request CRUD routes' },
  { path: 'packages/api/src/localSandbox/httpPendingActionRoutes.ts', maxLines: 80, reason: 'Pending-action route owner should stay focused on typed callback/status routes' },
  { path: 'packages/api/src/localSandbox/httpSandboxRoutes.ts', maxLines: 80, reason: 'Sandbox route owner should stay focused on local reset/import/readback administration' },
  { path: 'packages/api/src/sqliteSandboxStore.ts', maxLines: 120, reason: 'SQLite sandbox entrypoint must stay a thin facade' },
  { path: 'packages/api/src/sqliteSandbox/baseStore.ts', maxLines: 220, reason: 'SQLite base owner should stay focused on lifecycle and transactions' },
  { path: 'packages/api/src/sqliteSandbox/coreStore.ts', maxLines: 750, reason: 'core table owner should not absorb reservation, inventory, workflow, or dispatch logic' },
  { path: 'packages/api/src/sqliteSandbox/reservationStore.ts', maxLines: 900, reason: 'reservation table owner should stay bounded to reservation/stay readback' },
  { path: 'packages/api/src/sqliteSandbox/inventoryStore.ts', maxLines: 700, reason: 'inventory table owner should stay bounded to inventory projection persistence' },
  { path: 'packages/api/src/sqliteSandbox/workflowStore.ts', maxLines: 1000, reason: 'workflow owner should not absorb raw table persistence or dispatch logic' },
  { path: 'packages/api/src/sqliteSandbox/workflowTablesStore.ts', maxLines: 550, reason: 'workflow table owner should stay bounded to draft/group draft persistence' },
  { path: 'packages/api/src/sqliteSandbox/dispatchStore.ts', maxLines: 850, reason: 'dispatch owner should stay bounded to operation requests and dispatch ledger work' },
  { path: 'packages/api/src/sqliteSandbox/model.ts', maxLines: 80, reason: 'SQLite helper model barrel should only re-export focused helper modules' },
  { path: 'packages/api/src/sqliteSandbox/rows.ts', maxLines: 600, reason: 'SQLite row mapper owner should stay focused on row shapes and row-to-model mapping' },
  { path: 'packages/api/src/sqliteSandbox/ids.ts', maxLines: 250, reason: 'SQLite id helper owner should stay focused on deterministic ids and refs' },
  { path: 'packages/api/src/sqliteSandbox/json.ts', maxLines: 180, reason: 'SQLite JSON helper owner should stay focused on parsing/stringifying/cloning' },
  { path: 'packages/api/src/sqliteSandbox/dates.ts', maxLines: 180, reason: 'SQLite date helper owner should stay focused on business date utilities' },
  { path: 'packages/api/src/sqliteSandbox/inventoryModel.ts', maxLines: 380, reason: 'inventory helper owner should stay focused on pure inventory read-model derivation' },
  { path: 'packages/api/src/sqliteSandbox/workflowModel.ts', maxLines: 750, reason: 'workflow helper owner should stay focused on pure workflow response/read-model derivation' },
  { path: 'packages/api/src/sqliteSandbox/requestRecord.ts', maxLines: 220, reason: 'request-record helper owner should stay focused on API idempotency readback metadata' },
  { path: 'packages/api/src/sqliteSandbox/schema.ts', maxLines: 450, reason: 'SQLite schema owner should stay focused on DDL/migrations' },
  { path: 'packages/api/src/sqliteSandbox/projectionOutbox.ts', maxLines: 220, reason: 'Projection outbox owner should stay as pure derivation logic' },
  { path: 'packages/api/src/operations.ts', maxLines: 130, reason: 'API operation constants should remain a compact owner file' },
  { path: 'packages/api/src/capabilityManifest.ts', maxLines: 430, reason: 'capability manifest assembly should stay separate from API execution code' },
  { path: 'packages/provisioning/src/index.ts', maxLines: 80, reason: 'Provisioning public entrypoint must remain a compatibility re-export barrel' },
  { path: 'packages/provisioning/src/schema.ts', maxLines: 220, reason: 'Provisioning schema owner should stay focused on public spec types' },
  { path: 'packages/provisioning/src/profile.ts', maxLines: 200, reason: 'Provisioning profile owner should stay focused on fixtures and normalization' },
  { path: 'packages/provisioning/src/spec.ts', maxLines: 380, reason: 'Provisioning spec owner should stay focused on assembling the full Base spec' },
  { path: 'packages/provisioning/src/tables.ts', maxLines: 360, reason: 'Provisioning table owner should stay focused on table factory functions' },
  { path: 'packages/provisioning/src/fields.ts', maxLines: 80, reason: 'Provisioning field owner should stay focused on field helper construction' },
  { path: 'packages/provisioning/src/validation.ts', maxLines: 320, reason: 'Provisioning validation owner should stay focused on validation gates' },
  { path: 'packages/provisioning/src/larkPlan.ts', maxLines: 280, reason: 'Provisioning lark plan owner should stay focused on operation planning' },
  { path: 'packages/provisioning/src/larkJson.ts', maxLines: 120, reason: 'Provisioning lark JSON owner should stay focused on JSON/env materialization helpers' },
  { path: 'packages/provisioning/src/larkExecutor.ts', maxLines: 100, reason: 'Provisioning lark executor owner should stay focused on execution wrapper behavior' },
  { path: 'packages/contracts/src/index.ts', maxLines: 950, reason: 'contracts index must not absorb independent contract domains' },
  { path: 'packages/contracts/src/reservationWorkflow.ts', maxLines: 260, reason: 'reservation workflow contracts should remain a bounded domain file' },
  { path: 'packages/contracts/src/projectionOutbox.ts', maxLines: 80, reason: 'projection outbox contracts should remain a bounded domain file' },
  { path: 'packages/core/test/core-commands.test.ts', maxLines: 850, reason: 'Core command tests should stay behavior-focused and below legacy monolith size' },
  { path: 'packages/api/test/local-http-workflow.test.ts', maxLines: 760, reason: 'Local HTTP workflow tests should stay below legacy monolith size' },
  { path: 'packages/api/test/sqlite-workflow-store.test.ts', maxLines: 760, reason: 'SQLite workflow tests should stay below legacy monolith size' },
  { path: 'packages/provisioning/test/provisioning-spec.test.ts', maxLines: 420, reason: 'Provisioning spec tests should stay behavior-focused' },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(relativePath) {
  const fullPath = join(repoRoot, relativePath);
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(`${relativePath}: invalid JSON: ${error.message}`);
  }
}

function readText(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function collectFiles(relativeRoot, predicate) {
  const root = join(repoRoot, relativeRoot);
  if (!existsSync(root)) return [];
  const files = [];
  const stack = [relativeRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(join(repoRoot, current), { withFileTypes: true })) {
      const relativePath = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) stack.push(relativePath);
        continue;
      }
      if (predicate(entry.name, relativePath)) files.push(relativePath);
    }
  }
  return files.sort();
}

function collectPackageManifests() {
  return ['package.json', ...collectFiles('packages', (name) => name === 'package.json')];
}

function collectSourceFiles() {
  return sourceRoots.flatMap((root) => collectFiles(root, (name) => sourceFilePattern.test(name)));
}

function assertAllowedPackageName(packageName, context) {
  const forbidden = forbiddenPackages.find((rule) => rule.matches(packageName));
  assert(!forbidden, `${context} must not use ${packageName}; ${forbidden?.label ?? packageName} belongs outside pms-platform`);
}

function assertPackageManifest(relativePath) {
  const packageJson = readJson(relativePath);
  for (const bucket of dependencyBuckets) {
    for (const packageName of Object.keys(packageJson[bucket] ?? {})) {
      assertAllowedPackageName(packageName, `${relativePath} ${bucket}`);
    }
  }
}

function extractImportSpecifiers(text) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function assertSourceFile(relativePath) {
  const text = readText(relativePath);
  for (const specifier of extractImportSpecifiers(text)) {
    assertAllowedPackageName(specifier, relativePath);
  }
}

function assertLineBudget({ path, maxLines, reason }) {
  const text = readText(path);
  const lineCount = text.split('\n').length;
  assert(lineCount <= maxLines, `${path} has ${lineCount} lines, budget is ${maxLines}; ${reason}`);
}

assert(existsSync(join(repoRoot, 'AGENTS.md')), 'missing AGENTS.md boundary policy');
assert(existsSync(join(repoRoot, 'package.json')), 'missing package.json');

const agentsText = readText('AGENTS.md');
for (const snippet of requiredAgentSnippets) {
  assert(agentsText.includes(snippet), `AGENTS.md missing boundary snippet: ${snippet}`);
}

for (const relativePath of collectPackageManifests()) {
  assertPackageManifest(relativePath);
}

for (const relativePath of collectSourceFiles()) {
  assertSourceFile(relativePath);
}

for (const target of lineBudgetTargets) {
  assertLineBudget(target);
}

console.log('pms-platform boundary check passed');

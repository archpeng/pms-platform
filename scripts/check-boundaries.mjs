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

console.log('pms-platform boundary check passed');

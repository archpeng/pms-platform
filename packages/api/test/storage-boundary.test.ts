import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../../', import.meta.url);
const forbiddenStorageImports = [
  "from 'node:sqlite'",
  'from "node:sqlite"',
  "from 'better-sqlite3'",
  'from "better-sqlite3"',
  "from 'sqlite3'",
  'from "sqlite3"',
  "from 'node:fs'",
  'from "node:fs"',
  "from 'node:path'",
  'from "node:path"',
  "from 'node:http'",
  'from "node:http"',
];

describe('PMS storage boundary', () => {
  it('keeps core and contracts free of database and local runtime imports', () => {
    const checkedFiles = [
      ...sourceFiles('packages/core/src'),
      ...sourceFiles('packages/contracts/src'),
    ];

    expect(checkedFiles.length).toBeGreaterThan(0);

    const violations = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return forbiddenStorageImports
        .filter((needle) => source.includes(needle))
        .map((needle) => `${filePath}: ${needle}`);
    });

    expect(violations).toEqual([]);
  });
});

function sourceFiles(relativeDir: string): string[] {
  const dir = new URL(relativeDir, repoRoot).pathname;
  return walk(dir).filter((filePath) => filePath.endsWith('.ts'));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    return statSync(filePath).isDirectory() ? walk(filePath) : [filePath];
  });
}

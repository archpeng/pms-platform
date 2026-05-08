import { type CorePorts } from '@pms-platform/core';
import { type ApiIdempotencyRepository } from './index.js';
import {
  pmsSqliteDbPathEnvName,
  type PmsLocalSandboxStore,
} from './localSandbox.js';
import {
  type CreateSqliteLocalSandboxStoreOptions,
} from './sqliteSandbox/baseStore.js';
import { SqliteSandboxDispatchStore } from './sqliteSandbox/dispatchStore.js';

export { pmsSqliteDbPathEnvName };
export type { CreateSqliteLocalSandboxStoreOptions } from './sqliteSandbox/baseStore.js';

export class SqliteLocalSandboxStore extends SqliteSandboxDispatchStore implements PmsLocalSandboxStore {
  readonly ports: CorePorts;
  readonly apiIdempotency: ApiIdempotencyRepository;

  constructor(options: CreateSqliteLocalSandboxStoreOptions) {
    super(options);
    this.migrate();
    this.bootstrap(options);
    this.ports = this.createCorePorts();
    this.apiIdempotency = this.createApiIdempotencyRepository();
  }
}

export function createSqliteLocalSandboxStore(options: CreateSqliteLocalSandboxStoreOptions): SqliteLocalSandboxStore {
  return new SqliteLocalSandboxStore(options);
}

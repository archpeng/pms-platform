import type { PmsLocalSandboxStore } from './model.js';

export function executeWithStoreTransaction<TValue>(store: PmsLocalSandboxStore, operation: () => TValue): TValue {
  return store.runInTransaction ? store.runInTransaction(operation) : operation();
}

# SQLite Storage v1

## Decision

`pms-platform` uses `node:sqlite` for the first local SQLite storage layer.

Reasons:

1. The current runtime is Node 24 and already exposes `node:sqlite`.
2. The first target is a local/sandbox PMS canonical store, not production multi-node storage.
3. Avoiding a native npm SQLite package keeps install and CI complexity low for this slice.

Risk:

`node:sqlite` is still experimental in the local runtime and emits an `ExperimentalWarning`. This is acceptable for the local sandbox MVP only. Production database work remains separately scoped and should revisit the driver choice.

## Env Contract

```text
PMS_PLATFORM_SQLITE_DB_PATH=<sqlite db path>
```

Defaults:

```text
PMS_PLATFORM_SQLITE_DB_PATH=.local/pms.sqlite
```

SQLite is the only local sandbox persistence path. The earlier JSON file store, storage-kind selector, and JSON import fallback have been removed so runtime code cannot split between two canonical state stores.

## Boundary

SQLite belongs only in `packages/api`.

Forbidden:

1. `packages/core` importing `node:sqlite`, SQLite packages, `node:fs`, `node:path`, or HTTP server modules.
2. `packages/contracts` importing storage, filesystem, or HTTP modules.
3. `ai-pms` or `adapter-feishu` writing the SQLite database directly.
4. Feishu Base direct edits becoming PMS mutation input.

## Transaction Rule

Confirmed PMS commands must be atomic across:

1. room mutation;
2. housekeeping task write;
3. audit append;
4. domain event append;
5. core idempotency save;
6. API idempotency save.

Dry-run remains non-mutating for PMS room/task/audit/event/core state, but API idempotency can record the dry-run response.

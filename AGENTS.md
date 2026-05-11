# pms-platform agent policy

## Service role

`pms-platform` owns PMS domain truth for the Feishu/PMS product path. It owns PMS domain truth, persistence, state transitions, read models, audits, idempotency, and business invariants.

Active product chain:

```text
Feishu
  -> adapter-feishu
  -> pms-agent-v2
  -> pms-platform
```

Ownership split:

- `adapter-feishu`: Feishu transport, message/card delivery, typed-card callback transport, allowlists, dedupe, and managed Base adapter seams.
- `pms-agent-v2`: Pi/LLM conversation continuity, LLM semantic routing, safe tool planning, deterministic policy/PlanCompiler gate use, and grounded user replies.
- `pms-platform`: PMS domain truth, command semantics, typed workflow/capability execution, persistence, state transitions, read models, audits, idempotency, and business invariants.

## Boundary law

`pms-platform` must remain the PMS truth/read-model owner:

- PMS state changes must be typed commands or typed domain functions, not customer-chat tools;
- PMS reads must be typed read models, not generic SQL/projection/customer-chat surfaces;
- operation-request read/list APIs must be typed PMS read models, not generic customer-chat projection surfaces;
- future operation-request state transitions must preserve PMS-owned audits, idempotency, and business invariants;
- service/API/MCP layers must call PMS core behavior rather than reimplementing business rules.

`pms-platform` must not become a conversation, workflow, or transport owner:

- does not own Pi/LLM runtime or semantic routing;
- does not own Feishu conversation routing;
- does not own Feishu transport, cards, callbacks, allowlists, or dedupe;
- owns typed PMS workflow, pending-action, callback-result, event/readback/outbox, and projection-truth semantics;
- does not expose arbitrary HTTP, shell, file, SQL, Base/Bitable, or generic customer-chat tools.

## Dependency boundary

Do not add `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, or Feishu SDK packages such as `@larksuiteoapi/node-sdk` to this repo. Pi/LLM conversation runtime belongs in `pms-agent-v2`; Feishu runtime belongs in `adapter-feishu`; active PMS workflow/truth APIs belong in `pms-platform`.

## Validation

`npm run verify` is the repo-local verification ladder. It must run `scripts/check-boundaries.mjs` before build/test so accidental Pi/LLM/Feishu adapter runtime drift fails before PMS business verification proceeds.

## AI maintainability boundaries

Keep domain owners visible in file names instead of hiding business logic in catch-all `index.ts` or storage classes.

- `packages/core/src/index.ts` remains a compatibility re-export entrypoint only.
- `packages/core/src/model.ts` owns room aggregate modeling, status support lists, and pure room/task/ticket construction helpers.
- `packages/core/src/ports.ts` owns core repository, idempotency, audit, event, and port interfaces.
- `packages/core/src/commands.ts` owns check-in, checkout, housekeeping, maintenance command execution and domain validation.
- `packages/core/src/readModels.ts` owns PMS-owned room and dashboard read-model assembly.
- `packages/core/src/projections.ts` owns command projection assembly.
- `packages/core/src/inMemoryPorts.ts` owns replaceable in-memory core port implementations.
- `packages/api/src/index.ts` remains a compatibility re-export entrypoint only.
- `packages/api/src/commandApi.ts` owns PMS command API request/response mapping and execution.
- `packages/api/src/readModelApi.ts` owns PMS read-model API request/response mapping and execution.
- `packages/api/src/reservationWorkflowApi.ts` owns single-room reservation draft API contracts and executor seam.
- `packages/api/src/reservationGroupWorkflowApi.ts` owns multi-room reservation group draft API contracts and executor seam.
- `packages/api/src/pendingActionApi.ts` owns pending-action callback API contracts.
- `packages/api/src/operationRequestApi.ts` owns operation-request API contracts.
- `packages/api/src/fingerprint.ts` and `packages/api/src/idempotency.ts` own API fingerprint and idempotency helper behavior.
- `packages/api/src/localSandbox/httpHandler.ts` remains local HTTP auth/error orchestration and route ordering only.
- `packages/api/src/localSandbox/httpHealthRoutes.ts`, `httpCommandRoutes.ts`, `httpReadRoutes.ts`, `httpWorkflowRoutes.ts`, `httpOperationRequestRoutes.ts`, `httpPendingActionRoutes.ts`, and `httpSandboxRoutes.ts` own their named local sandbox HTTP route families.
- `packages/api/src/sqliteSandboxStore.ts` remains the thin SQLite sandbox facade: constructor, public factory, and inherited interface wiring only.
- `packages/api/src/sqliteSandbox/baseStore.ts` owns SQLite connection lifecycle, storage metadata, bootstrap/reset helpers, and transaction boundaries.
- `packages/api/src/sqliteSandbox/coreStore.ts` owns room/catalog, housekeeping, maintenance, audit/event, and idempotency table access.
- `packages/api/src/sqliteSandbox/reservationStore.ts` owns reservation import/readback, allocation, stay lifecycle, today arrivals/departures, and room reservation context.
- `packages/api/src/sqliteSandbox/inventoryStore.ts` owns inventory rebuild, inventory blocks, day-room rows, intervals, and summary projection persistence.
- `packages/api/src/sqliteSandbox/workflowStore.ts` owns reservation draft/group draft state transitions and pending-action callback flow.
- `packages/api/src/sqliteSandbox/workflowTablesStore.ts` owns reservation draft/group draft SQLite table persistence.
- `packages/api/src/sqliteSandbox/dispatchStore.ts` owns operation-request persistence and projection dispatch ledger work assembly.
- `packages/api/src/sqliteSandbox/schema.ts` owns SQLite DDL and compatible schema migration helpers.
- `packages/api/src/sqliteSandbox/projectionOutbox.ts` owns projection outbox derivation from PMS truth/readback records.
- `packages/api/src/sqliteSandbox/model.ts` is a compatibility re-export for focused SQLite helper modules such as rows, ids, JSON, dates, inventory, workflow, and request-record mapping.
- `packages/api/src/operations.ts` owns API operation names and operation union types.
- `packages/api/src/capabilityManifest.ts` owns PMS capability manifest and planner projection assembly.
- `packages/provisioning/src/index.ts` remains a compatibility re-export entrypoint only.
- `packages/provisioning/src/schema.ts` owns PMS Base provisioning schema and public spec types.
- `packages/provisioning/src/profile.ts` owns hotel profile fixtures, parsing, and normalization.
- `packages/provisioning/src/spec.ts`, `packages/provisioning/src/tables.ts`, and `packages/provisioning/src/fields.ts` own PMS Base spec/table/field construction.
- `packages/provisioning/src/validation.ts` owns provisioning spec validation gates.
- `packages/provisioning/src/larkPlan.ts`, `packages/provisioning/src/larkJson.ts`, and `packages/provisioning/src/larkExecutor.ts` own lark-cli plan construction, JSON materialization, and execution wrappers.
- `packages/contracts/src/index.ts` is the compatibility export surface plus remaining core contracts; new independent contract domains should be added as named files and re-exported from `index.ts`.
- `packages/contracts/src/reservationWorkflow.ts` owns reservation draft/group workflow and pending-action contracts.
- `packages/contracts/src/projectionOutbox.ts` owns PMS projection outbox contracts.
- `packages/contracts/src/fixtures.ts` owns shared contract/sample fixture constants, including the small hotel room-number to room-type mapping reused by provisioning and local sandbox seed code.

When adding behavior, prefer extending the domain owner file above or creating a similarly named owner file. Do not add new Feishu transport, Pi/LLM routing, generic SQL, or customer-chat behavior to PMS truth modules.

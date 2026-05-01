# PMS R3 API/MCP Hermes Feishu v1 — WORKSET

> Superseded execution queue for the historical PMS-owned API/MCP -> Hermes -> Feishu integration pack.
> Machine mode: single-root parser-compatible under `pms-platform/docs/plan/*`.

## Stage Order

- [x] `S0` baseline-reanchor
- [x] `S1` api-mcp-contract-skeleton
- [x] `S2` checkout-api-local-surface
- [x] `S3` checkout-mcp-tool-surface
- [x] `S4` hermes-local-pms-tool-smoke
- [~] `S5` hermes-feishu-messaging-config — superseded while blocked
- [~] `S6` feishu-card-confirmation-loop — superseded
- [~] `S7` pms-result-feishu-projection — superseded
- [~] `S8` remote-checkout-e2e-sandbox — superseded
- [x] `S9` closeout-and-next-pack — supersession closeout written

## Completed Stages

### `S0` — baseline-reanchor

- Owner: `plan-creator`
- State: `DONE`
- Priority: `high`

完成证据：

1. `ai-pms-core-bootstrap-v1` is closed and archived under `adapter-feishu/docs/archive/plan/`.
2. `adapter-feishu` baseline is committed/pushed and remains independent.
3. `pms-platform` initial checkout core proof is committed/pushed.
4. `pms-platform/docs/plan/README.md` now points to this active PMS-owned plan pack.
5. This pack made `S1` the deterministic next execution slice.

### `S1` — api-mcp-contract-skeleton

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. Added `packages/api` and `packages/mcp` workspace packages.
2. Added typed `pms_check_out` dry-run and confirm API/MCP contract types through PMS package boundaries.
3. Added `docs/request-fingerprint-idempotency-v1.md`.
4. `npm run verify` passed after S1 with 4 test files / 26 tests.
5. No HTTP server runtime, MCP server runtime, Hermes config, Feishu callback, adapter integration, or durable persistence was introduced.

### `S2` — checkout-api-local-surface

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/api/src/index.ts` exports `executeCheckOutApiRequest`, `toCheckOutApiResponse`, and `createInMemoryApiIdempotencyRepository`.
2. The API function calls `checkOut` from `@pms-platform/core` and preserves PMS Core dry-run, confirm, and domain error structures.
3. Duplicate idempotency keys with incompatible fingerprints are rejected before PMS Core re-entry.
4. API tests cover dry-run, confirm, duplicate idempotency, invalid metadata, and invalid room state.
5. `npm run verify` passed after S2 with 4 test files / 30 tests.
6. No network deployment, Feishu callback, Hermes configuration, or database persistence was added.

### `S3` — checkout-mcp-tool-surface

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/mcp/src/index.ts` exports `executePmsCheckOutTool` and `pmsCheckOutToolInputSchema`.
2. The MCP handler calls the PMS API/Core path and returns structured dry-run/confirm output.
3. Tool schema includes actor/source/reason/correlation/idempotency/mode/requestFingerprint fields.
4. Tests cover dry-run, confirm, stable errors, incompatible fingerprints, and prompt-injection-style confirm bypass attempts.
5. `docs/hermes-pms-tooling-v1.md` documents Hermes should call this tool rather than writing PMS/Feishu state directly.
6. `npm run verify` passed after S3 with 5 test files / 34 tests.
7. No Hermes runtime configuration or MCP transport/server selection was introduced.

### `S4` — hermes-local-pms-tool-smoke

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/mcp/test/hermes-local-smoke.test.ts` proves a Hermes-shaped local request can call `pms_check_out` dry-run and receive structured PMS output.
2. The same probe proves confirm execution requires explicit confirmation metadata and preserves actor/source/correlation in audit output.
3. `docs/hermes-local-pms-tool-smoke-v1.md` records the local transcript, guard note, and non-goals.
4. `npm run verify` passed after S4 with 6 test files / 36 tests.
5. No Feishu messaging, real secrets, MCP transport decision, or global Hermes config was added.

## Active Stage

### `PACK_SUPERSEDED` — supersede-stale-hermes-feishu-lane

- Owner: `plan-creator`
- State: `SUPERSEDED`
- Priority: `terminal`

目标：

- Remove the stale Hermes/Feishu S5 blocker from active execution truth without claiming S5-S8 implementation completion.

必须交付：

1. A repo-local closeout/supersession artifact that preserves S0-S4 evidence and marks S5-S9 inactive.
2. README/STATUS/WORKSET alignment showing no active pack and no active execution slice.
3. Validation evidence for docs/control-plane cleanup.

done_when:

1. `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_CLOSEOUT.md` exists and records the supersession boundary.
2. `docs/plan/README.md` no longer routes execution to S5.
3. STATUS/WORKSET no longer treat Hermes Feishu messaging as active customer-facing backlog.
4. `git diff --check`, `npm run verify`, and `plan_sync` pass, or any residual is explicitly named.

stop_boundary:

1. Stop before claiming S5-S8 were implemented.
2. Stop before reintroducing Hermes as current customer hot-path owner without a new architecture decision.
3. Stop before editing runtime code for this docs/control-plane cleanup.

必须避免：

1. Enabling broad remote shell/tool access without user allowlists and confirmation gates.
2. Claiming production readiness or Feishu remote rollout from this supersession.

supersession evidence:

1. `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_CLOSEOUT.md` records retained S0-S4 evidence and superseded S5-S9 scope.
2. The active customer-facing path is now `adapter-feishu -> ai-conversation -> ai-pms -> pms-platform`.
3. Broad remote access was not enabled and no secrets were committed.

## Queued Stages

### `S6` — feishu-card-confirmation-loop

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Build the Feishu card confirmation loop through `adapter-feishu` for checkout dry-run -> confirm.

done_when:

1. `npm run verify` passes in any touched repo.
2. Feishu card callback can trigger confirm only for a prior dry-run/correlation/idempotency context.
3. Adapter code remains a channel adapter and does not own checkout transition rules.
4. Duplicate/stale confirmation does not duplicate PMS Core side effects.

stop_boundary:

1. Stop before production Feishu rollout.
2. Stop if adapter/PMS callback auth semantics are ambiguous.

### `S7` — pms-result-feishu-projection

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Project PMS checkout results back to Feishu as human-visible UI without making Feishu canonical truth.

### `S8` — remote-checkout-e2e-sandbox

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Prove the full sandbox chain: Feishu UI -> Hermes -> PMS API/MCP -> PMS Core -> adapter-feishu -> Feishu result.

### `S9` — closeout-and-next-pack

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Close this R3/R4/R5/R6 integration proof and prepare the next production-hardening pack.

## Machine Queue

- active_step: `PACK_SUPERSEDED`
- latest_completed_step: `S4`
- intended_handoff: `plan-creator` for any future pack
- active_pack: `none`
- superseded_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- latest_closeout_summary: S0-S4 retained as historical PMS API/MCP/Hermes-shaped local smoke evidence; S5-S9 superseded because the active customer-facing PMS/Feishu path no longer uses Hermes as hot-path conversation/runtime owner.
- latest_verification:
  - `npm run verify passed historically after S4/S5 docs: 6 test files / 36 tests.`
  - `2026-05-01 supersession closeout is docs/control-plane only; validation rerun recorded in final workspace closeout.`
  - `adapter-feishu smoke:provider-webhook delivered to Feishu using gitignored local ADAPTER_FEISHU_SMOKE_CHAT_ID during historical S5 attempt.`
  - `hermes gateway restart connected to Feishu/Lark websocket during historical S5 attempt.`
  - `Stage Order marks S0-S4 done; S5-S8 are superseded, not implemented.`
  - `docs/hermes-feishu-messaging-config-v1.md records no-secret checklist, allowlist rule, and failure modes.`

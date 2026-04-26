# PMS R3 API/MCP Hermes Feishu v1 — STATUS

> Pack status: active
> Current truth owner: `pms-platform/docs/plan/*`
> Last updated: 2026-04-26

## Current Step

- active_step: `S1`

## Planned Stages

- [x] `S0` baseline-reanchor
- [ ] `S1` api-mcp-contract-skeleton
- [ ] `S2` checkout-api-local-surface
- [ ] `S3` checkout-mcp-tool-surface
- [ ] `S4` hermes-local-pms-tool-smoke
- [ ] `S5` hermes-feishu-messaging-config
- [ ] `S6` feishu-card-confirmation-loop
- [ ] `S7` pms-result-feishu-projection
- [ ] `S8` remote-checkout-e2e-sandbox
- [ ] `S9` closeout-and-next-pack

## Immediate Focus

### `S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `high`

目标：

- Create PMS-owned API/MCP package skeletons and shared tool contracts around the existing `CHECK_OUT` core behavior.

当前事实：

- `adapter-feishu` baseline is deployed/stable and remains the Feishu/Lark channel adapter.
- Hermes baseline is installed and gateway is running, but Feishu messaging is not configured yet.
- PMS Core `CHECK_OUT` proof is implemented and documented in `packages/core` and `docs/checkout-core-v1.md`.
- `ai-pms-core-bootstrap-v1` is closed and archived under `adapter-feishu/docs/archive/plan/`.

必须交付：

1. Workspace packages for API and MCP surfaces, e.g. `packages/api` and `packages/mcp` or a documented equivalent.
2. A typed `pms_check_out` request/response shape that imports contracts/core types instead of duplicating business semantics.
3. Request-fingerprint/idempotency design note for future persistence and distributed retries.
4. Tests proving package boundaries compile and core remains Feishu/Hermes independent.

done_when:

1. `npm run verify` passes in `/home/peng/dt-git/github/pms-platform`.
2. API/MCP contract types import `@pms-platform/contracts` and/or `@pms-platform/core` through package boundaries.
3. No Feishu/Hermes/adapter SDK or runtime types are imported by `packages/core` or `packages/contracts`.
4. `pms_check_out` has explicit dry-run and confirm request/response shapes with stable error passthrough.

stop_boundary:

1. Stop before implementing HTTP server runtime or MCP server runtime.
2. Stop if tool contract design would require changing PMS Core checkout semantics.
3. Stop if request-fingerprint/idempotency semantics require a human decision beyond documenting the design.

必须避免：

1. Duplicating checkout transition rules outside PMS Core.
2. Introducing Feishu SDK or Hermes runtime dependencies into PMS Core/contracts.

## Machine State

- active_step: `S1`
- latest_completed_step: `S0`
- intended_handoff: `execute-plan`
- active_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- status: `ready_for_execution`
- next_step_after_active: `S2`
- latest_closeout_summary: `ai-pms-core-bootstrap-v1` closed; PMS Core CHECK_OUT proof is implemented, documented, committed, and pushed.
- latest_verification:
  - `adapter-feishu baseline exists and latest closeout is archived`
  - `Hermes baseline exists; gateway running; Feishu messaging not configured`
  - `pms-platform CHECK_OUT proof exists in packages/core and docs/checkout-core-v1.md`
  - `plan_sync on pms-platform/docs/plan previously reported no active plans; this pack now activates PMS-owned R3 work`

## Evidence So Far

- `adapter-feishu` latest pushed commit: `a8d4c11 docs: close AI PMS core bootstrap`.
- `pms-platform` latest pushed commit: `12b1834 feat: bootstrap PMS checkout core`.
- `pms-platform/docs/checkout-core-v1.md` recommends R3 PMS API/MCP tool exposure as next scope.
- Final bootstrap verification passed:
  - `adapter-feishu npm run verify`: 26 test files / 84 tests.
  - `pms-platform npm run verify`: 2 test files / 19 tests.
- Hermes status showed gateway running but Feishu messaging not configured.

## Open Risks

| Risk | Current control |
|---|---|
| API/MCP layer duplicates PMS Core rules | S1/S2/S3 require imports from contracts/core and tests proving wrappers call PMS Core. |
| Hermes or Feishu bypasses PMS Core | S3-S8 stop laws forbid raw table/state writes and require PMS tool path. |
| Feishu credentials or Hermes messaging setup missing | S5 has explicit credential/blocker stop boundary and no-secret-in-git rule. |
| Idempotency insufficient for distributed API/MCP use | S1/S2 require request-fingerprint design/guard before durable exposure. |
| Adapter absorbs PMS domain behavior | S6/S7 forbid checkout state-machine logic in `adapter-feishu/src/**`. |

## Notes

- Keep this pack rooted in `pms-platform/docs/plan/*`; do not reactivate the closed adapter-hosted bootstrap pack.
- Use Feishu as final UI/collaboration surface only after PMS API/MCP and Hermes tool path are stable.

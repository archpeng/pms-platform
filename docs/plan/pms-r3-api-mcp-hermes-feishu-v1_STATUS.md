# PMS R3 API/MCP Hermes Feishu v1 — STATUS

> Pack status: active
> Current truth owner: `pms-platform/docs/plan/*`
> Last updated: 2026-04-26

## Current Step

- active_step: `S5`

## Planned Stages

- [x] `S0` baseline-reanchor
- [x] `S1` api-mcp-contract-skeleton
- [x] `S2` checkout-api-local-surface
- [x] `S3` checkout-mcp-tool-surface
- [x] `S4` hermes-local-pms-tool-smoke
- [ ] `S5` hermes-feishu-messaging-config
- [ ] `S6` feishu-card-confirmation-loop
- [ ] `S7` pms-result-feishu-projection
- [ ] `S8` remote-checkout-e2e-sandbox
- [ ] `S9` closeout-and-next-pack

## Immediate Focus

### `S5`

- Owner: `execute-plan`
- State: `BLOCKED`
- Priority: `high`

目标：

- Configure Hermes Feishu messaging enough for controlled remote operation entry, with secrets and allowlists kept out of git.

当前事实：

- S1-S4 have landed PMS package contracts, local API execution, local MCP tool execution, and a local Hermes-shaped PMS tool smoke.
- `docs/hermes-feishu-messaging-config-v1.md` records the no-secret Feishu/Hermes config checklist, operator allowlist rule, and failure modes.
- Local Feishu app credentials and sandbox chat id are configured outside git.
- `adapter-feishu` provider webhook smoke delivered to Feishu with `body.code = 0` and `status = delivered`.
- Hermes gateway was restarted with Feishu env and connected to Feishu/Lark websocket.
- No explicit `FEISHU_ALLOWED_USERS` / equivalent PMS operator allowlist value was found; Hermes warned unauthorized users will be denied.
- No secrets were committed and no mutating PMS commands were enabled from Feishu.

stop_boundary hit:

1. Stop before allowing mutating PMS commands from Feishu without card confirmation.

## Machine State

- active_step: `S5`
- latest_completed_step: `S4`
- intended_handoff: `human decision`
- active_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- status: `blocked_operator_allowlist`
- next_step_after_active: `S6`
- latest_closeout_summary: S5 progressed through local Feishu adapter smoke and Hermes Feishu websocket connection; blocked on explicit operator allowlist / inbound proof.
- latest_verification:
  - `2026-04-26 npm run verify passed in pms-platform after S4/S5 docs: 6 test files / 36 tests`
  - `adapter-feishu smoke:provider-webhook delivered to Feishu using gitignored local ADAPTER_FEISHU_SMOKE_CHAT_ID`
  - `hermes gateway restart connected to Feishu/Lark websocket`
  - `S5 blocker doc records no-secret config checklist, allowlist rule, and failure modes`

## Evidence So Far

- `adapter-feishu` latest pushed commit: `a8d4c11 docs: close AI PMS core bootstrap`.
- `pms-platform` latest pushed commit: `12b1834 feat: bootstrap PMS checkout core`.
- `pms-platform/docs/checkout-core-v1.md` recommends R3 PMS API/MCP tool exposure as next scope.
- S1 implementation verification passed:
  - `pms-platform npm run verify`: 4 test files / 26 tests.
  - API/MCP contract types import `@pms-platform/contracts`, `@pms-platform/core`, and package boundaries as intended.
- S2 implementation verification passed:
  - `pms-platform npm run verify`: 4 test files / 30 tests.
  - API local execution covers dry-run, confirm, duplicate idempotency, invalid metadata, and invalid room state.
- S3 implementation verification passed:
  - `pms-platform npm run verify`: 5 test files / 34 tests.
  - MCP tool execution covers dry-run, confirm, stable errors, incompatible fingerprints, and prompt-injection-style confirm bypass attempts.
- S4 implementation verification passed:
  - `pms-platform npm run verify`: 6 test files / 36 tests.
  - Local Hermes-shaped PMS tool smoke covers dry-run and explicit confirm.
- Cross-pack ai-pms product S2 implementation landed without advancing this blocked S5 gate:
  - `docs/pms-checkout-local-sandbox-runtime-v1.md` documents the PMS-owned local HTTP sandbox boundary.
  - `packages/api/src/localSandbox.ts` and `packages/api/src/localServerMain.ts` expose file-backed checkout state, auth env names, health, readback, reset, and `POST /v1/pms/check-out` through existing API/Core boundaries.
  - `packages/api/test/local-sandbox-http.test.ts` covers auth, dry-run no-write, confirm write, restart persistence, incompatible fingerprint rejection, readback, reset, and prompt-injection text not changing mode.
  - Verification after product S2: `npm run verify` passed with 7 test files / 39 tests.

## Open Risks

| Risk | Current control |
|---|---|
| API/MCP layer duplicates PMS Core rules | S1-S4 tests prove API/MCP wrappers call PMS Core and preserve result structures. |
| Hermes or Feishu bypasses PMS Core | S3-S8 stop laws forbid raw table/state writes and require PMS tool path. |
| Feishu operator allowlist / inbound proof missing | S5 is blocked on explicit allowlist or manual allowed-user inbound proof; no secrets committed and broad access is not enabled. |
| Idempotency insufficient for distributed API/MCP use | S2 implements in-memory request-fingerprint guard; durable policy remains future persistence scope. |
| Adapter absorbs PMS domain behavior | S6/S7 forbid checkout state-machine logic in `adapter-feishu/src/**`. |

## Notes

- Keep this pack rooted in `pms-platform/docs/plan/*`; do not reactivate the closed adapter-hosted bootstrap pack.
- Use Feishu as final UI/collaboration surface only after PMS API/MCP and Hermes tool path are stable.

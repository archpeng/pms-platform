# PMS R3 API/MCP Hermes Feishu v1 — WORKSET

> Active execution queue for the PMS-owned API/MCP -> Hermes -> Feishu integration pack.
> Machine mode: single-root parser-compatible under `pms-platform/docs/plan/*`.

## Stage Order

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

### `S5` — hermes-feishu-messaging-config

- Owner: `execute-plan`
- State: `BLOCKED`
- Priority: `high`

目标：

- Configure Hermes Feishu messaging enough for controlled remote operation entry, with secrets and allowlists kept out of git.

必须交付：

1. Local secret/config checklist for Hermes Feishu platform setup.
2. User allowlist / operator authorization rule documented and, if possible, enabled locally.
3. Feishu message ingress smoke showing Hermes can receive and respond in the intended sandbox.
4. Failure-mode docs for disabled platform, unauthorized user, missing secret, and gateway down.

done_when:

1. Hermes status no longer reports Feishu messaging as unconfigured in the local sandbox, or a documented blocker is routed.
2. Feishu sandbox message smoke proves Hermes can respond remotely.
3. No secrets are committed.
4. Unauthorized remote operation is denied or documented as blocked before production use.

stop_boundary:

1. Stop if real Feishu credentials/tenant setup are missing.
2. Stop before allowing mutating PMS commands from Feishu without card confirmation.

必须避免：

1. Enabling broad remote shell/tool access without user allowlists and confirmation gates.

阻塞证据：

1. `docs/hermes-feishu-messaging-config-v1.md` records the local secret/config checklist, allowlist rule, and failure modes.
2. Local adapter Feishu smoke delivered and Hermes connected to Feishu/Lark websocket.
3. Explicit operator allowlist / allowed-user inbound proof is still missing; broad remote access was not enabled.
4. No secrets were committed and no mutating PMS commands were enabled from Feishu.

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

- active_step: `S5`
- latest_completed_step: `S4`
- intended_handoff: `human decision`
- active_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- latest_closeout_summary: S5 progressed through local Feishu adapter smoke and Hermes Feishu websocket connection; blocked on explicit operator allowlist / inbound proof.
- latest_verification:
  - `npm run verify passed: 6 test files / 36 tests.`
  - `adapter-feishu smoke:provider-webhook delivered to Feishu using gitignored local ADAPTER_FEISHU_SMOKE_CHAT_ID.`
  - `hermes gateway restart connected to Feishu/Lark websocket.`
  - `Stage Order marks S0-S4 done; S5 remains active and blocked on operator allowlist / inbound proof.`
  - `docs/hermes-feishu-messaging-config-v1.md records no-secret checklist, allowlist rule, and failure modes.`
  - `Cross-pack ai-pms product S2 landed PMS local HTTP sandbox runtime and durable checkout state/readback; this pack's S5 remains blocked on operator allowlist / inbound proof.`

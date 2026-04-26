# PMS R3 API/MCP Hermes Feishu v1 — PLAN

> Pack status: active
> Current truth owner: `pms-platform/docs/plan/*`
> Last updated: 2026-04-26

## Objective

Build the next PMS-owned integration lane from the proven PMS Core `CHECK_OUT` behavior to safe API/MCP tools, Hermes operator access, and Feishu final UI expression through `adapter-feishu`.

This pack starts from completed baselines:

```text
adapter-feishu baseline
Hermes baseline
PMS Core CHECK_OUT proof
```

This pack closes the missing chain in stages:

```text
PMS API/MCP tools
Hermes calls PMS tools
Hermes Feishu messaging configuration
Feishu card confirmation loop
PMS result projection back to Feishu
```

## Target Architecture

```text
Feishu human UI
  -> adapter-feishu channel adapter
  -> Hermes Agent AI operator
  -> PMS MCP/API tools
  -> PMS Core CHECK_OUT command
  -> PMS audit/events/result
  -> adapter-feishu projection/notification
  -> Feishu card/Base/group result
```

Ownership remains strict:

| Plane | Owns | Must not own |
|---|---|---|
| PMS Core | business truth, commands, state machine, idempotency, audit, events | Feishu SDK, Hermes prompts, HTTP/MCP transport details |
| PMS API/MCP | safe tool/HTTP surface over PMS Core | duplicated checkout rules, Feishu card rendering |
| Hermes | AI operator, conversation, tool selection, dry-run explanation, confirmation orchestration | PMS truth, direct DB writes, critical direct Feishu Base writes |
| adapter-feishu | Feishu/Lark channel adapter, message/card delivery, callbacks, projection helper | PMS state machine, Hermes runtime, PMS Core business logic |
| Feishu | final UI/collaboration surface | canonical PMS state or hidden business rules |

## Non-goals

1. Do not merge PMS Core into `adapter-feishu`.
2. Do not put Hermes runtime code inside PMS Core.
3. Do not make Feishu Base the canonical PMS database.
4. Do not expand beyond first `CHECK_OUT` workflow until this lane is verified.
5. Do not implement Postgres/durable outbox before request-fingerprint idempotency and API/MCP semantics are settled.
6. Do not configure real secrets into git; runtime Feishu/Hermes credentials stay local or secret-managed.

## Global Validation Ladder

1. `pms-platform`: `npm run verify` must pass after package/API/MCP changes.
2. API/MCP tests must prove handlers/tools call PMS Core instead of duplicating checkout rules.
3. Adapter tests must pass when `adapter-feishu` is touched: `npm run verify` in `/home/peng/dt-git/github/adapter-feishu`.
4. Hermes integration may use local smoke tests/transcripts; secrets and allowlists must not be committed.
5. Feishu remote operation proof must show dry-run -> human confirmation -> confirm -> result projection without bypassing PMS Core audit/idempotency.

## Stage Plan

### `S0` — baseline-reanchor

- Owner: `plan-creator`
- State: `DONE`
- Priority: `high`

目标：

- Re-anchor the repo-local PMS plan after `ai-pms-core-bootstrap-v1` closeout.

交付物：

1. Confirm adapter-feishu baseline exists and remains independent.
2. Confirm Hermes baseline exists but Feishu messaging is not configured.
3. Confirm PMS Core `CHECK_OUT` proof exists and is documented.
4. Activate this PMS-owned R3 plan pack under `pms-platform/docs/plan/*`.

done_when:

1. `docs/plan/README.md` points to this active pack.
2. `STATUS` and `WORKSET` agree on active slice `S1`.
3. Historical adapter-hosted bootstrap pack is not treated as active truth.

stop_boundary:

1. Stop and replan if another active PMS plan pack exists.

必须避免：

1. Continuing execution from adapter-feishu `docs/plan/*` for PMS-owned R3 work.

完成证据：

1. `pms-platform/docs/plan/README.md` now points to `pms-r3-api-mcp-hermes-feishu-v1`.
2. `S1` is the active next execution slice.

### `S1` — api-mcp-contract-skeleton

- Owner: `execute-plan`
- State: `READY`
- Priority: `high`

目标：

- Create PMS-owned API/MCP package skeletons and shared tool contracts around the existing `CHECK_OUT` core behavior.

交付物：

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

### `S2` — checkout-api-local-surface

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Implement a local PMS API surface for `CHECK_OUT` that wraps PMS Core and remains independently testable without Feishu or Hermes.

交付物：

1. API handler/function for checkout dry-run and confirm.
2. Stable structured response mapping for success/errors.
3. Idempotency request fingerprint guard at API boundary, at least in-memory/test-backed for this slice.
4. API tests for dry-run, confirm, duplicate idempotency, invalid metadata, and invalid room state.

done_when:

1. `npm run verify` passes.
2. API tests prove the API calls `checkOut` from `@pms-platform/core`.
3. Dry-run and confirm results preserve PMS Core result/error structure.
4. Reused `idempotencyKey` with incompatible payload is rejected or explicitly routed to a documented residual.

stop_boundary:

1. Stop before adding network deployment, Feishu callbacks, or Hermes tool configuration.
2. Stop before adding database persistence.

必须避免：

1. Reimplementing the room transition matrix in the API layer.

### `S3` — checkout-mcp-tool-surface

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Implement a PMS MCP tool surface for Hermes to call `CHECK_OUT` safely.

交付物：

1. `pms_check_out` MCP tool descriptor/schema.
2. Tool handler that calls the PMS API/core wrapper and returns structured dry-run/confirm output.
3. Tool tests for dry-run, confirm, stable errors, and prompt-injection-style attempts to bypass confirm.
4. Documentation explaining Hermes should call this tool rather than writing Feishu/PMS state directly.

done_when:

1. `npm run verify` passes.
2. Tool schema includes actor/source/reason/correlation/idempotency/mode fields.
3. Mutating execution requires explicit `confirm` intent.
4. Tool handler does not import or call Feishu SDK/adapter internals.

stop_boundary:

1. Stop before configuring Hermes itself.
2. Stop if MCP server transport choice is ambiguous and needs replan.

必须避免：

1. Giving Hermes raw table-write or arbitrary state-write tools.

### `S4` — hermes-local-pms-tool-smoke

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Configure or document a local Hermes-to-PMS-tool smoke path without Feishu messaging.

交付物：

1. Hermes local tool configuration or runbook for calling PMS MCP/API in sandbox.
2. Transcript/probe showing Hermes can request checkout dry-run and receive structured PMS output.
3. Transcript/probe showing confirm path can execute only with explicit confirmation metadata.
4. Guard note proving Hermes does not directly mutate PMS Core or Feishu Base.

done_when:

1. A local Hermes smoke or documented equivalent proves PMS tool calling works.
2. PMS Core tests still pass.
3. No real secrets are committed.
4. Hermes remains an operator over PMS tools, not PMS truth owner.

stop_boundary:

1. Stop before enabling Feishu messaging.
2. Stop if Hermes tool registration requires credentials or global config that should be handled manually.

必须避免：

1. Letting Hermes bypass PMS API/MCP and call repository internals directly.

### `S5` — hermes-feishu-messaging-config

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Configure Hermes Feishu messaging enough for controlled remote operation entry, with secrets and allowlists kept out of git.

交付物：

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

### `S6` — feishu-card-confirmation-loop

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Build the Feishu card confirmation loop through `adapter-feishu` for checkout dry-run -> confirm.

交付物：

1. Adapter-facing contract for sending checkout dry-run cards and receiving confirmation callbacks.
2. Card content includes room, current status, next status, task preview, reason, actor, and correlation/idempotency metadata.
3. Confirmation callback routes to PMS API/MCP confirm path and not directly to PMS Core internals.
4. Adapter tests proving callback validation, stale/duplicate confirmation handling, and no PMS business rule duplication.

done_when:

1. `npm run verify` passes in any touched repo.
2. Feishu card callback can trigger confirm only for a prior dry-run/correlation/idempotency context.
3. Adapter code remains a channel adapter and does not own checkout transition rules.
4. Duplicate/stale confirmation does not duplicate PMS Core side effects.

stop_boundary:

1. Stop before production Feishu rollout.
2. Stop if adapter/PMS callback auth semantics are ambiguous.

必须避免：

1. Implementing PMS state machine logic in `adapter-feishu/src/**`.

### `S7` — pms-result-feishu-projection

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Project PMS checkout results back to Feishu as human-visible UI without making Feishu canonical truth.

交付物：

1. Result projection contract for checkout result messages/Base records/cards.
2. Adapter projection helper or documented call path from PMS worker/API to `adapter-feishu`.
3. Tests or smoke proving `RoomCheckedOut` and `HousekeepingTaskCreated` results can be shown in Feishu.
4. Clear boundary that Feishu Base is projection/collaboration surface only.

done_when:

1. Result projection carries PMS correlation/idempotency/audit references.
2. Failed PMS commands produce visible structured Feishu feedback.
3. `adapter-feishu` verify passes if touched.
4. PMS Core remains independent of Feishu SDK.

stop_boundary:

1. Stop before durable outbox or Postgres projection unless a new persistence pack is planned.
2. Stop before expanding to maintenance/housekeeping workflows.

必须避免：

1. Treating Feishu Base writes as canonical PMS state transitions.

### `S8` — remote-checkout-e2e-sandbox

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Prove the full sandbox chain: Feishu UI -> Hermes -> PMS API/MCP -> PMS Core -> adapter-feishu -> Feishu result.

交付物：

1. End-to-end sandbox transcript or reproducible smoke script.
2. Evidence for dry-run explanation, human confirmation, confirm execution, idempotency, and Feishu result projection.
3. Security checklist covering actor identity, allowlist, confirmation, secrets, and audit correlation.
4. Residual list for production hardening.

done_when:

1. A Feishu-originated checkout request can be dry-run and confirmed through Hermes/PMS tooling in sandbox.
2. PMS Core audit/events/idempotency are present in the result evidence.
3. Result is visible in Feishu.
4. All touched repo verification commands pass.

stop_boundary:

1. Stop before production rollout.
2. Stop if any link bypasses PMS Core or lacks actor/authorization proof.

必须避免：

1. Accepting a demo that only writes Feishu without executing PMS Core.

### `S9` — closeout-and-next-pack

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Close this R3/R4/R5/R6 integration proof and prepare the next production-hardening pack.

交付物：

1. Closeout document with evidence, verification, risks, and residuals.
2. Archived or closed `docs/plan/*` state.
3. Recommendation for next pack: persistence/outbox, production Feishu rollout, or workflow expansion.
4. Commit/push guidance for all touched repos.

done_when:

1. All previous slices are reviewed or residualized.
2. Active pack is closed or explicitly superseded.
3. Next pack scope is explicit.

stop_boundary:

1. Stop if production safety risks remain unreviewed.

必须避免：

1. Starting production rollout inside closeout.

## Handoff Policy

- Active slice handoff: `execute-plan` for `S1`.
- Review after each implementation slice: `execution-reality-audit`.
- Replan if package boundaries, Hermes Feishu credential availability, MCP transport, or adapter callback auth become contested.
- Closeout uses the repo-local closeout prompt surface after S9 review.

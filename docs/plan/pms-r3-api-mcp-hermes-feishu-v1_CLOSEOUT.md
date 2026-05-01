# PMS R3 API/MCP Hermes Feishu v1 — CLOSEOUT / SUPERSESSION

## Result

- state: `superseded`
- closed_at: `2026-05-01`
- route: `PLAN -> EXEC -> REVIEW -> SUPERSEDE`
- outcome: `partial_api_mcp_foundation_retained_historical_hermes_feishu_hot_path_superseded`
- production_readiness_claimed: `false`

## Supersession Verdict

This pack is superseded as an active execution lane. It completed the PMS-owned API/MCP foundation through `S4`, then blocked at `S5` on Feishu/Hermes operator allowlist and inbound proof. The broader project control plane has since moved the active customer-facing PMS/Feishu path to:

```text
Feishu -> adapter-feishu -> ai-conversation -> ai-pms -> pms-platform
```

The current customer hot path does **not** use Hermes as the conversation/runtime owner. Therefore the remaining `S5-S9` Hermes/Feishu slices are not active backlog and must not remain as the repo-local active plan.

## Retained Historical Evidence

The completed `S0-S4` evidence remains valid historical PMS foundation work:

1. `S0` re-anchored the PMS-owned plan pack after adapter bootstrap closeout.
2. `S1` added PMS API/MCP contract skeletons around `CHECK_OUT` without Feishu/Hermes runtime dependencies in PMS Core/contracts.
3. `S2` added local checkout API execution over PMS Core.
4. `S3` added the `pms_check_out` MCP tool surface over PMS API/Core.
5. `S4` proved a local Hermes-shaped PMS tool smoke without enabling Feishu messaging or committing secrets.

## Superseded Scope

The following queued/blocked work is no longer active under this pack:

1. `S5` Hermes Feishu messaging configuration / operator allowlist proof.
2. `S6` Feishu card confirmation loop through Hermes.
3. `S7` PMS result Feishu projection through the old Hermes lane.
4. `S8` remote checkout E2E sandbox for the Hermes path.
5. `S9` closeout for that old lane.

Future PMS/Feishu work must start from a new plan pack that uses the current ownership split and current ai-pms production-readiness GO/NO-GO truth.

## Current Boundary

1. PMS business truth remains in `pms-platform`.
2. `adapter-feishu` owns Feishu transport and typed card callbacks.
3. `ai-conversation` owns customer-facing natural-language conversation intelligence.
4. `ai-pms` owns PMS workflow orchestration, typed-card identity law, pending/callback/outbox state, and projection coordination.
5. Hermes is not on the current customer-facing hot path unless a future explicit architecture decision reopens it.

## Validation

This supersession is a docs/control-plane cleanup. It does not change runtime code, PMS business rules, schemas, or package exports.

Closeout validation passed:

1. `git diff --check` passed in `/home/peng/dt-git/github/pms-platform`.
2. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform`: build plus 11 test files / 84 tests.
3. `plan_sync /home/peng/dt-git/github/pms-platform/docs/plan` passed and reports the superseded pack STATUS/WORKSET as 6 done / 0 pending.
4. Workspace inventory before commit shows only docs/plan supersession writeback dirty in `pms-platform`.

## Residuals / Successors

1. If PMS-owned API/MCP surfaces are still useful, create a new non-Hermes PMS service-surface pack aligned with `ai-pms` and `ai-conversation`.
2. If Hermes operator support is desired for internal tooling, create a separate internal-operator-only architecture decision and plan; do not attach it to the customer-facing PMS/Feishu hot path by default.
3. Broader production residuals remain owned by the `ai-pms` production-readiness successor list: observability/alert receivers/telemetry labels/dashboard, managed durability/backup restore, historical outbox cleanup/retention, and unsupported lifecycle expansion.

## Final Notes

This closeout removes the stale active `S5 blocked_operator_allowlist` lane from `pms-platform/docs/plan/*` without pretending `S5-S9` were completed. The completed `S0-S4` evidence stays historical; the active control plane now requires a new pack for any future work.

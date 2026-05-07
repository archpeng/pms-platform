# PMS Platform Agent Typed Capabilities CLOSEOUT

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`
Final state: `closed`
Closed at: 2026-05-07
Final commits:

- `5f0e1a1` test: prove typed PMS agent capabilities
- `400bc94` docs: accept typed capabilities final audit

## Summary

This pack is closed. `pms-platform` now has platform-side evidence for the typed PMS capabilities that a successor `pms-agent-v2` pack can consume through gated tools instead of synthetic reservation workflow evidence.

The pack stayed inside `pms-platform`. It did not add Pi/LLM runtime, Feishu transport/runtime, `pms-agent-v2` imports, generic customer-chat APIs, or final natural-language mutation routes.

## Closed Scope

Closed platform-side work:

1. Published the platform-owned contract doc `docs/pms-agent-v2-typed-capabilities-contract-v1.md`.
2. Proved planner projection exposes agent-safe typed read/draft/prepare-confirm capabilities while excluding confirm/internal/pending-action execution routes and endpoint/auth metadata.
3. Proved reservation draft/quote/prepare-confirm/pending-action status response shapes use redacted refs and avoid raw `draftId` in agent-visible pending-action read models.
4. Proved the local typed route sequence `availability/search -> reservation-drafts/create -> reservation-drafts/update -> reservation-drafts/quote -> reservation-drafts/prepare-confirm -> pending-actions/status` without final PMS mutation.
5. Accepted final P4 audit and archived this plan pack out of the hot parser surface.

## Final Evidence

Validation evidence recorded for the pack:

- `npm run verify` passed: boundary check, build, 11 test files / 98 tests.
- `git diff --check` passed.
- Static dependency/import scan found no forbidden Pi/Feishu/adapter/`pms-agent-v2` runtime dependency or import; scan hits were boundary scripts/tests only.
- `plan_sync docs/plan` after archive returns no active parser plans.
- Workspace clean after closeout commit/push.

Primary evidence files:

- `docs/pms-agent-v2-typed-capabilities-contract-v1.md`
- `packages/api/test/api-contract.test.ts`
- `packages/api/test/local-sandbox-http.test.ts`
- `packages/contracts/test/contracts.test.ts`
- `packages/contracts/src/index.ts`
- `packages/api/src/sqliteSandboxStore.ts`
- `scripts/check-boundaries.mjs`

## Successor Handoff

Residual work belongs to `pms-agent-v2` only:

1. Wire typed gated tools to the contracted `pms-platform` routes.
2. Keep route/auth execution authority in gated tool configuration, not in LLM planner projection.
3. Treat planner projection as advisory capability metadata only.
4. Persist only allowed redacted refs and typed read-model summaries needed for conversation continuity.
5. Remove synthetic runtime workflow evidence such as synthetic `prepareReservationConfirm` evidence.

Out of scope for `pms-platform` after this closeout:

- Pi/LLM runtime implementation.
- Feishu transport/card/callback delivery implementation.
- `pms-agent-v2` tool wiring.
- Production rollout, live secret wiring, or SLA claims.

## Archive

Archived plan files live under:

```text
docs/plan-archive/pms-platform-agent-typed-capabilities-v1-2026-05-07/
```

The hot parser surface `docs/plan/` intentionally retains only `README.md` after this closeout until a new active pack is created.

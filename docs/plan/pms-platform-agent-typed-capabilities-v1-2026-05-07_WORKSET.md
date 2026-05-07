# PMS Platform Agent Typed Capabilities WORKSET

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Stage Order

- [x] `P0` agent-platform-contract-doc
- [x] `P1` capability-manifest-agent-safety-proof
- [x] `P2` typed-workflow-response-shape-proof
- [x] `P3` agent-route-sequence-local-smoke
- [x] `P4` final-platform-agent-contract-closeout
- [ ] `PACK_COMPLETE` closeout

## Active Stage

### `PACK_COMPLETE`

- Owner: `autopilot-closeout`
- State: `READY`
- Priority: `terminal`

目标：

- Close this platform-side pack after P4 accepted review marks the objective complete.

必须交付：

1. Closeout summary.
2. Final evidence and successor handoff to `pms-agent-v2`.
3. Hot/cold plan hygiene update.

done_when:

1. Pack is terminal and no active implementation/review work remains.

stop_boundary:

1. If any non-terminal slice remains active, hand back to that slice; do not close out.

必须避免：

1. Do not use closeout to skip P4 final audit.
## Current Wave

### `PACK_COMPLETE` closeout

- Active stage: `PACK_COMPLETE`
- Active stage state: `READY`
- Next handoff: `autopilot-closeout`
- Dominant owner boundary: terminal closeout and hot/cold plan hygiene after accepted platform-side audit.
- Execute ladder: `PACK_COMPLETE` -> terminal closeout
- Validation ladder: `plan_sync docs/plan`, clean workspace check, and final closeout evidence summary.
- Current stage doneWhenMet must prove:
  1. Pack is terminal and no active implementation/review work remains.
- Current stage stopBoundaryHit must cite one of:
  1. If any non-terminal slice remains active, hand back to that slice; do not close out.
- P4 accepted evidence:
  1. Reality audit re-read P0-P3 docs/tests/code against AGENTS.md PMS ownership law.
  2. Static scans found no forbidden Pi/Feishu/adapter/`pms-agent-v2` runtime dependency or import; hits were boundary scripts/tests only.
  3. `npm run verify` passed: boundary check, build, 11 test files / 98 tests.
  4. `git diff --check` passed.
  5. Workspace was clean with `HEAD == origin/main` at `5f0e1a1`.
- Successor residual for `pms-agent-v2` only:
  1. Wire typed gated tools to the contracted platform routes.
  2. Keep route/auth execution authority in gated tool configuration, not LLM planner projection.
  3. Persist only allowed redacted refs and typed read-model summaries.
  4. Remove synthetic runtime workflow evidence.

## Master Wave Ladder

1. `W1/P0` agent-platform-contract-foundation: platform-owned contract doc maps capability manifest, availability, reservation draft create/update/quote/prepare-confirm, and pending-action status to existing typed routes; accepted review advances to `P1`.
2. `W2/P1` capability-manifest-agent-safety-proof: focused manifest/projection tests prove safe natural-language capabilities and no endpoint/auth leakage; accepted review advances to `P2`.
3. `W3/P2` typed-workflow-response-shape-proof: focused API/local sandbox tests prove draft/quote/prepare-confirm/pending-action response shapes and no final mutation; accepted review advances to `P3`.
4. `W4/P3` agent-route-sequence-local-smoke: local HTTP route-sequence smoke proves availability -> draft -> quote -> prepare-confirm -> pending-action status; accepted review advances to `P4`.
5. `W5/P4` final-audit-and-handoff: reality audit plus forbidden-import/generic-tool scans; accepted review advances to `PACK_COMPLETE` only if all platform-side gaps are closed.

Best active wave now: `PACK_COMPLETE`, because P4 accepted the final audit and the remaining work is repo-local closeout.

## Detailed Execution Queue

### `P0` workset — agent-platform-contract-doc

状态：accepted by review.

已确认：

1. `docs/pms-agent-v2-typed-capabilities-contract-v1.md` exists as the platform-owned consumption contract doc.
2. The doc maps capability manifest, availability, reservation draft create/update/quote/prepare-confirm, and pending-action status to existing PMS-owned routes/source/tests.
3. The doc states planner projection is advisory and final mutation remains typed pending-action callback only.
4. `npm run check:boundaries`, `git diff --check`, and `plan_sync docs/plan` passed during P0 review.

### `P1` workset — capability-manifest-agent-safety-proof

执行步骤：

1. Add or tighten tests around `getPmsCapabilityManifest()` and planner projection.
2. Prove agent-safe read/draft/prepare-confirm capabilities are present.
3. Prove confirm/internal capabilities are not natural-language planner actions.
4. Prove planner projection omits endpoint path and bearer auth.
5. Run `npm run verify`, `git diff --check`, and `plan_sync docs/plan`.

预期：

- Pi-side gated tool planning can consume manifest/projection without endpoint/auth leakage.
- P1 execution tightened `packages/api/test/api-contract.test.ts` and is ready for review.

测试预期：

- Availability and reservation draft/quote/prepare-confirm appear.
- Pending-action confirm/cancel do not appear in planner projection.
- Confirm/internal capabilities do not appear in planner projection.
- Endpoint paths and bearer auth do not appear in planner projection.
- `npm run test -- packages/api/test/api-contract.test.ts` passed.
- `npm run verify` passed.

- P1 accepted: `npm run test -- packages/api/test/api-contract.test.ts`, `git diff --check`, and `plan_sync docs/plan` passed during review.

### `P2` workset — typed-workflow-response-shape-proof

执行步骤：

1. Inspect current reservation draft workflow API response types and local sandbox behavior.
2. Add focused tests for create/update/quote/prepare-confirm stable response refs.
3. Add focused pending-action status proof without confirm/cancel side effect.
4. Document any response-name mismatch as platform contract truth, not compatibility alias.
5. Run `npm run verify`, `git diff --check`, and `plan_sync docs/plan`.

预期：

- The platform response surface is sufficient for `pms-agent-v2` to remove synthetic workflow evidence.
- P2 accepted by review after removing raw `draftId` from pending-action read models.

测试预期：

- prepare-confirm returns no-final-mutation semantics.
- pending-action status is readable without final mutation.
- draft create/update/quote/prepare-confirm return stable redacted refs and omit `draftId`.
- pending-action status returns `mutationStatus=none` and `idempotencyStatus=statusRead` without confirm/cancel side effects or raw `draftId`.
- `npm run test -- packages/api/test/local-sandbox-http.test.ts packages/api/test/sqlite-sandbox-store.test.ts packages/contracts/test/contracts.test.ts packages/api/test/api-contract.test.ts` passed during review.
- `npm run verify` passed during review.

### `P3` workset — agent-route-sequence-local-smoke

执行步骤：

1. Add a focused local sandbox HTTP route-sequence smoke.
2. Use typed route calls only: availability -> draft -> quote -> prepare-confirm -> pending-action status.
3. Assert no confirm/cancel route or final PMS mutation is needed.
4. Link smoke evidence from the P0 contract doc.
5. Run `npm run verify` and `git diff --check`.

预期：

- The full platform route sequence needed by `pms-agent-v2` is locally reproducible with no live secrets.
- P3 accepted by review: `npm run test -- packages/api/test/local-sandbox-http.test.ts` and `git diff --check` passed during review.

测试预期：

- Smoke passes against local sandbox HTTP with bearer auth.
- No mutation occurs before typed pending-action callback.
- `packages/api/test/local-sandbox-http.test.ts` now covers availability/search -> reservation-drafts/create -> update -> quote -> prepare-confirm -> pending-actions/status.
- The smoke asserts no pending-action confirm/cancel route is called and PMS room/reservation/operation-request/audit/domain-event truth is unchanged before callback.
- `npm run test -- packages/api/test/local-sandbox-http.test.ts` passed: 11 tests.
- `npm run verify` passed: 11 test files / 98 tests.

### `P4` workset — final-platform-agent-contract-closeout

状态：accepted by review.

已确认：

1. Reality audit compared P0-P3 docs/tests/code to AGENTS.md ownership law and the active plan.
2. Static scans found no forbidden Pi/Feishu/adapter/`pms-agent-v2` runtime dependency or import; scan hits were boundary scripts/tests only.
3. `docs/pms-agent-v2-typed-capabilities-contract-v1.md` lists only `pms-agent-v2` successor work and does not implement successor wiring.
4. `npm run verify` passed: boundary check, build, 11 test files / 98 tests.
5. `git diff --check` passed and workspace was clean with `HEAD == origin/main` at `5f0e1a1`.

### `PACK_COMPLETE` workset — closeout

执行步骤：

1. Produce terminal closeout summary.
2. Record final evidence and successor handoff to `pms-agent-v2`.
3. Apply hot/cold plan hygiene if required.

预期：

- Pack is terminal and no active implementation/review work remains.

测试预期：

- `plan_sync docs/plan` parses and workspace remains clean after closeout.

## Slice Ownership

### `P0`

- `docs/pms-agent-v2-typed-capabilities-contract-v1.md`
- `docs/plan/README.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`

### `P1`

- `packages/api/src/index.ts` read-only unless a manifest bug is proven.
- `packages/api/test/api-contract.test.ts`
- `packages/api/test/local-sandbox-http.test.ts` if local manifest HTTP proof needs tightening.
- `docs/plan/README.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`

### `P2`

- `packages/api/src/index.ts` read-only unless a response type bug is proven.
- `packages/api/src/localSandbox.ts` read-only unless a local HTTP behavior bug is proven.
- `packages/api/test/api-contract.test.ts` if API-level response-shape proof is needed.
- `packages/api/test/local-sandbox-http.test.ts`
- `docs/plan/README.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`

## Expected Verification

- P0 accepted: `npm run check:boundaries`; `git diff --check`; `plan_sync docs/plan`.
- P1-P3: targeted tests plus `npm run verify`; `git diff --check`; `plan_sync docs/plan`.
- P4: `npm run verify`; forbidden import/generic-tool static scans; `git diff --check`; `plan_sync docs/plan`.

## Autopilot Transition Contract

- `execute/completed` proves implementation evidence and dispatches same-slice `review`.
- Do not mark or advance the active slice from execute alone unless the whole objective reports `done`.
- `review/completed` is the accepted writeback gate that marks the reviewed slice complete and loads the next `Stage Order` item as `Active Stage`.
- `review/continue` keeps this `Active Stage`; `needs_replan` routes to `replan`; hard stops leave this stage active for repair.
- The next execute phase may run only after README/STATUS/WORKSET parse with the same active slice and intended handoff.
- Closeout is forbidden unless active slice is `PACK_COMPLETE`, intended handoff is `autopilot-closeout`, and no non-deferred implementation/review stages remain.

## Review Gate Required For Every Stage

Before any stage is marked done, review must answer:

1. Did this stage keep Pi/LLM and Feishu runtime out of `pms-platform`?
2. Did this stage preserve typed PMS ownership instead of adding generic customer-chat APIs?
3. Did this stage preserve pending-action callback as the final mutation boundary?
4. Did this stage avoid compatibility aliases for synthetic agent stubs?
5. Did `npm run verify` or the stage-specific validation pass?

## Handoff After This Review Turn

- Next skill: `execution-reality-audit`
- Active stage: `PACK_COMPLETE`
- Expected next phase: `closeout`
- Closeout owner: repo-local closeout prompt surface

## Machine Queue

- active_step: `PACK_COMPLETE`
- latest_completed_step: `P4`
- intended_handoff: `autopilot-closeout`
- latest_closeout_summary: P4 review accepted; parser truth advanced to PACK_COMPLETE for repo-local closeout.
- latest_verification:
  - `Re-read active PLAN/STATUS/WORKSET, AGENTS.md, contract doc, manifest/projection code/tests, local route smoke, and pending-action redaction surfaces`
  - `docs/pms-agent-v2-typed-capabilities-contract-v1.md lists only pms-agent-v2 successor wiring and keeps Pi/LLM/Feishu/generic tooling out of pms-platform`
  - `packages/api/test/api-contract.test.ts proves planner projection includes safe typed read/draft/prepare-confirm capabilities and excludes confirm/internal/pending-action routes plus endpoint/auth metadata`
  - `packages/api/test/local-sandbox-http.test.ts proves availability -> draft create/update -> quote -> prepare-confirm -> pending-action status without final PMS mutation`
  - `packages/contracts/src/index.ts and packages/api/src/sqliteSandboxStore.ts omit raw draftId from PendingActionReadModel`
  - `Static dependency/import scan found no forbidden Pi/Feishu/adapter/pms-agent-v2 runtime dependency or import; hits were boundary scripts/tests only`
  - `npm run verify passed: pms-platform boundary check, build, 11 test files / 98 tests`
  - `git diff --check passed`
  - `workspace clean and HEAD == origin/main at 5f0e1a1`
  - `plan_sync docs/plan parsed after P4 writeback`
  - `docs/plan/README.md`
  - `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
  - `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`
## Notes

- This work intentionally creates the plan in `/home/peng/dt-git/github/pms-platform/docs/plan`.
- Do not use the current `pms-agent-v2` dirty workspace as implementation scope for this pack.
- `pms-agent-v2` successor work begins only after this platform contract is accepted or a reviewed slice exports a stable handoff.

# PMS Platform Agent Typed Capabilities WORKSET

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Stage Order

- [x] `P0` agent-platform-contract-doc
- [x] `P1` capability-manifest-agent-safety-proof
- [x] `P2` typed-workflow-response-shape-proof
- [x] `P3` agent-route-sequence-local-smoke
- [ ] `P4` final-platform-agent-contract-closeout
- [ ] `PACK_COMPLETE` closeout

## Active Stage

### `P4`

- Owner: `execution-reality-audit`
- State: `QUEUED`
- Priority: `high`

目标：

- Audit the platform-side contract, remove residue, and prepare terminal handoff to a successor `pms-agent-v2` implementation pack.

必须交付：

1. Reality audit comparing P0-P3 docs/tests/code to this plan and current PMS ownership laws.
2. Static scan evidence for no Pi/Feishu/conversation imports and no generic customer-chat tools.
3. Residual handoff listing only `pms-agent-v2` successor work: wire typed gated tools to real platform routes and remove synthetic runtime workflow evidence.
4. Parser truth advanced to `PACK_COMPLETE` only if P0-P3 accepted review evidence exists.

done_when:

1. All platform-side implementation slices have accepted review evidence.
2. No generic broker/workflow/platform abstraction or conversation runtime drift remains.
3. STATUS/WORKSET can safely move to `PACK_COMPLETE`.

stop_boundary:

1. Stop if any Pi/LLM, Feishu SDK, adapter, or `pms-agent-v2` dependency appears in `pms-platform`.
2. Stop if any platform API permits final mutation from natural-language workflow routes.
3. Stop if closeout would hide a platform contract gap as successor work.

必须避免：

1. Do not close out with unresolved platform-side route or response-shape bugs.
2. Do not implement the successor `pms-agent-v2` wiring in this repo.
## Current Wave

### `W5` final-audit-and-handoff

- Active stage: `P4`
- Active stage state: `READY`
- Next handoff: `execution-reality-audit`
- Dominant owner boundary: final platform-side reality audit and successor handoff without implementing `pms-agent-v2` wiring.
- Execute ladder: `P4` -> `PACK_COMPLETE`
- Validation ladder: `npm run verify`, forbidden import/generic-tool static scans, `git diff --check`, and `plan_sync docs/plan`.
- Current stage doneWhenMet must prove:
  1. All platform-side implementation slices have accepted review evidence.
  2. No generic broker/workflow/platform abstraction or conversation runtime drift remains.
  3. STATUS/WORKSET can safely move to `PACK_COMPLETE`.
- Current stage stopBoundaryHit must cite one of:
  1. Stop if any Pi/LLM, Feishu SDK, adapter, or `pms-agent-v2` dependency appears in `pms-platform`.
  2. Stop if any platform API permits final mutation from natural-language workflow routes.
  3. Stop if closeout would hide a platform contract gap as successor work.
- P4 likely code/test surfaces:
  1. `AGENTS.md` — PMS ownership and dependency boundary law.
  2. `scripts/check-boundaries.mjs` and `package.json` — boundary validation authority.
  3. `docs/pms-agent-v2-typed-capabilities-contract-v1.md` — successor handoff truth.
  4. `packages/api/test/local-sandbox-http.test.ts` and `packages/api/test/api-contract.test.ts` — accepted P1-P3 test evidence.
  5. Static scans across `packages/` — forbidden import/generic-tool proof.
- P4 linear execution steps:
  1. Reality-audit P0-P3 docs/tests/code against PMS ownership law and this plan.
  2. Static scan for forbidden Pi/Feishu/conversation imports and generic customer-chat tools.
  3. Remove slice-created redundant docs, comments, compatibility aliases, or unused helpers if found.
  4. Record successor handoff to `pms-agent-v2` only.
  5. Move parser truth to `PACK_COMPLETE` only after accepted evidence exists.
- Execution writeback: keep `P4` active until accepted evidence can move parser truth to `PACK_COMPLETE`.

## Master Wave Ladder

1. `W1/P0` agent-platform-contract-foundation: platform-owned contract doc maps capability manifest, availability, reservation draft create/update/quote/prepare-confirm, and pending-action status to existing typed routes; accepted review advances to `P1`.
2. `W2/P1` capability-manifest-agent-safety-proof: focused manifest/projection tests prove safe natural-language capabilities and no endpoint/auth leakage; accepted review advances to `P2`.
3. `W3/P2` typed-workflow-response-shape-proof: focused API/local sandbox tests prove draft/quote/prepare-confirm/pending-action response shapes and no final mutation; accepted review advances to `P3`.
4. `W4/P3` agent-route-sequence-local-smoke: local HTTP route-sequence smoke proves availability -> draft -> quote -> prepare-confirm -> pending-action status; accepted review advances to `P4`.
5. `W5/P4` final-audit-and-handoff: reality audit plus forbidden-import/generic-tool scans; accepted review advances to `PACK_COMPLETE` only if all platform-side gaps are closed.

Best active wave now: `W5/P4`, because P3 accepted the local route-sequence smoke and the remaining platform-side proof is final audit/handoff.

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

执行步骤：

1. Reality-audit P0-P3 docs/tests/code against PMS ownership law and this plan.
2. Static scan for forbidden Pi/Feishu/conversation imports and generic customer-chat tools.
3. Remove slice-created redundant docs, comments, compatibility aliases, or unused helpers.
4. Record successor handoff to `pms-agent-v2` only.
5. Move parser truth to `PACK_COMPLETE` only after accepted evidence exists.

预期：

- Platform-side contract is complete and terminal-ready.

测试预期：

- `npm run verify`, static scans, `git diff --check`, and plan parser validation pass.

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
- Active stage: `P4`
- Expected next phase: `review`
- Review owner for P4 final audit evidence: `execution-reality-audit`

## Machine Queue

- active_step: `P4`
- latest_completed_step: `P3`
- intended_handoff: `execution-reality-audit`
- latest_closeout_summary: P3 review accepted; parser truth advanced to P4 final audit/handoff.
- latest_verification:
  - `Re-read active PLAN/STATUS/WORKSET, AGENTS.md, P0 contract doc, P3 HTTP smoke, localSandbox route authority, and API request/response types`
  - `packages/api/test/local-sandbox-http.test.ts contains the authenticated P3 smoke: availability/search -> reservation-drafts/create -> update -> quote -> prepare-confirm -> pending-actions/status`
  - `The smoke asserts operation names, redacted refs, typedCardOnly confirmation, pending-action statusRead, and mutationStatus none/draftOnly before callback`
  - `The smoke does not call pending-actions/confirm or pending-actions/cancel and asserts rooms/reservations/operationRequests/audits/domainEvents are unchanged before callback`
  - `docs/pms-agent-v2-typed-capabilities-contract-v1.md links the route-sequence smoke and leaves P4 as the only remaining platform-side proof`
  - `npm run test -- packages/api/test/local-sandbox-http.test.ts passed: 11 tests`
  - `P3 execute evidence already recorded npm run verify passed: boundary check, build, and 11 test files / 98 tests`
  - `git diff --check passed`
  - `plan_sync docs/plan parsed after review writeback: STATUS/WORKSET done=4 pending=2`
  - `packages/api/test/local-sandbox-http.test.ts`
  - `packages/api/src/localSandbox.ts`
  - `packages/api/src/index.ts`
  - `docs/pms-agent-v2-typed-capabilities-contract-v1.md`
  - `docs/plan/README.md`
  - `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
  - `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`
## Notes

- This work intentionally creates the plan in `/home/peng/dt-git/github/pms-platform/docs/plan`.
- Do not use the current `pms-agent-v2` dirty workspace as implementation scope for this pack.
- `pms-agent-v2` successor work begins only after this platform contract is accepted or a reviewed slice exports a stable handoff.

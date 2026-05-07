# PMS Platform Agent Typed Capabilities WORKSET

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Stage Order

- [ ] `P0` agent-platform-contract-doc
- [ ] `P1` capability-manifest-agent-safety-proof
- [ ] `P2` typed-workflow-response-shape-proof
- [ ] `P3` agent-route-sequence-local-smoke
- [ ] `P4` final-platform-agent-contract-closeout
- [ ] `PACK_COMPLETE` closeout

## Active Stage

### `P0`

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- Create the platform-owned contract that lets `pms-agent-v2` consume real typed PMS capabilities without synthetic runtime evidence or generic adapters.

必须交付：

1. New or updated doc under `docs/` naming the `pms-agent-v2` consumption contract, supported routes, response authority, redaction rules, and non-goals.
2. Contract cites existing PMS-owned source files/tests instead of inventing a second API surface.
3. Explicit successor handoff section for `pms-agent-v2`: which platform routes are ready to replace synthetic `prepareReservationConfirm` evidence.

done_when:

1. The doc maps availability, reservation draft create/update/quote/prepare-confirm, pending-action status, and capability manifest to existing platform routes.
2. The doc states that planner projection is advisory and final mutation remains typed pending-action callback only.
3. `npm run check:boundaries` and `git diff --check` pass.

stop_boundary:

1. Stop if documenting the contract reveals that `pms-platform` must own Pi/LLM, Feishu transport, or conversation routing.
2. Stop if the contract would require a generic HTTP broker or customer-chat endpoint.
3. Stop if existing routes cannot support the handoff and the missing route cannot be specified as a narrow typed PMS route.

必须避免：

1. Do not edit `pms-agent-v2` in this slice.
2. Do not promise production readiness, rollout, or live secret wiring.
3. Do not create duplicate SSOT docs for existing core/API behavior.

## Current Wave

### `W1` agent-platform-contract-foundation

- Active stage: `P0`
- Active stage state: `READY`
- Next handoff: `execute-plan`
- Dominant owner boundary: platform-owned contract and manifest truth before any agent-side wiring.
- Execute ladder: `P0` -> `P1`
- Validation ladder: docs check, `npm run check:boundaries`, targeted API contract tests, `npm run verify`, and `git diff --check`.
- Current stage doneWhenMet must prove:
  1. The doc maps availability, reservation draft create/update/quote/prepare-confirm, pending-action status, and capability manifest to existing platform routes.
  2. The doc states that planner projection is advisory and final mutation remains typed pending-action callback only.
  3. `npm run check:boundaries` and `git diff --check` pass.
- Current stage stopBoundaryHit must cite one of:
  1. Stop if documenting the contract reveals that `pms-platform` must own Pi/LLM, Feishu transport, or conversation routing.
  2. Stop if the contract would require a generic HTTP broker or customer-chat endpoint.
  3. Stop if existing routes cannot support the handoff and the missing route cannot be specified as a narrow typed PMS route.
- P0 likely code/docs surfaces:
  1. `docs/`
  2. `packages/api/src/index.ts`
  3. `packages/api/test/api-contract.test.ts`
  4. `packages/api/src/localSandbox.ts`
  5. `packages/api/test/local-sandbox-http.test.ts`
- P0 exit criteria before review handoff:
  1. Platform-owned agent consumption contract exists and cites existing PMS-owned route/test surfaces.
  2. No code outside `pms-platform` is edited.
  3. Parser truth remains aligned and `git diff --check` passes.
- Accepted-review writeback: mark `P0` done, set `P1` as active stage, keep intended handoff `execute-plan`.

## Master Wave Ladder

1. `W1` agent-platform-contract-foundation: `P0` -> `P1`.
2. `W2` typed-workflow-evidence-proof: `P2` -> `P3`.
3. `W3` final-audit-and-handoff: `P4` -> `PACK_COMPLETE`.

## Detailed Execution Queue

### `P0` workset — agent-platform-contract-doc

执行步骤：

1. Read `AGENTS.md`, `README.md`, `packages/api/src/index.ts`, `packages/api/src/localSandbox.ts`, and the existing API/local sandbox tests.
2. Add a single high-density doc under `docs/` for `pms-agent-v2` consumption of typed PMS Platform capabilities.
3. Map existing typed routes and manifest/projection semantics; do not invent new routes in P0.
4. Include non-goals: no Pi runtime, no Feishu transport, no generic customer-chat API, no production rollout.
5. Include successor handoff for `pms-agent-v2`: real routes that can replace synthetic workflow evidence.
6. Run `npm run check:boundaries` and `git diff --check`.

预期：

- `pms-agent-v2` has a stable platform-owned contract to consume later, but this repo does not implement agent wiring.

测试预期：

- Boundary check passes.
- No parser/control-plane drift.

### `P1` workset — capability-manifest-agent-safety-proof

执行步骤：

1. Add or tighten tests around `getPmsCapabilityManifest()` and planner projection.
2. Prove agent-safe read/draft/prepare-confirm capabilities are present.
3. Prove confirm/internal capabilities are not natural-language planner actions.
4. Prove planner projection omits endpoint path and bearer auth.
5. Run `npm run verify`.

预期：

- Pi-side gated tool planning can consume manifest/projection without endpoint/auth leakage.

测试预期：

- Availability and reservation draft/quote/prepare-confirm appear.
- Pending-action confirm/cancel do not appear in planner projection.

### `P2` workset — typed-workflow-response-shape-proof

执行步骤：

1. Inspect current reservation draft workflow API response types and local sandbox behavior.
2. Add focused tests for create/update/quote/prepare-confirm stable response refs.
3. Add focused pending-action status proof without confirm/cancel side effect.
4. Document any response-name mismatch as platform contract truth, not compatibility alias.
5. Run `npm run verify`.

预期：

- The platform response surface is sufficient for `pms-agent-v2` to remove synthetic workflow evidence.

测试预期：

- prepare-confirm returns no-final-mutation semantics.
- pending-action status is readable without final mutation.

### `P3` workset — agent-route-sequence-local-smoke

执行步骤：

1. Add a focused local sandbox HTTP route-sequence smoke.
2. Use typed route calls only: availability -> draft -> quote -> prepare-confirm -> pending-action status.
3. Assert no confirm/cancel route or final PMS mutation is needed.
4. Link smoke evidence from the P0 contract doc.
5. Run `npm run verify` and `git diff --check`.

预期：

- The full platform route sequence needed by `pms-agent-v2` is locally reproducible with no live secrets.

测试预期：

- Smoke passes against local sandbox HTTP with bearer auth.
- No mutation occurs before typed pending-action callback.

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

- `docs/`
- `docs/plan/README.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_PLAN.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`
- `packages/api/src/index.ts` read-only unless a documentation citation reveals a contract typo
- `packages/api/src/localSandbox.ts` read-only unless a documentation citation reveals a contract typo

## Expected Verification

- P0: `npm run check:boundaries`; `git diff --check`; `plan_sync docs/plan`.
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

## Handoff After This Planning Turn

- Next skill: `execute-plan`
- Active stage: `P0`
- Expected next phase: `execute`
- Review owner after P0 execute evidence: `execution-reality-audit`

## Machine Queue

- active_step: `P0`
- latest_completed_step: `none`
- intended_handoff: `execute-plan`
- latest_plan_summary: Created platform-side plan pack for typed PMS capabilities consumed by `pms-agent-v2`.
- latest_verification:
  - `Read package-owned plan-creator skill and autopilot control-plane references.`
  - `Read pms-platform AGENTS.md, docs/plan/README.md, README.md, API manifest/local sandbox surfaces, and API contract test excerpts.`
  - `Created active PLAN/STATUS/WORKSET pack under pms-platform/docs/plan for platform-side work only.`

## Notes

- This work intentionally creates the plan in `/home/peng/dt-git/github/pms-platform/docs/plan`.
- Do not use the current `pms-agent-v2` dirty workspace as implementation scope for this pack.
- `pms-agent-v2` successor work begins only after this platform contract is accepted or a reviewed slice exports a stable handoff.

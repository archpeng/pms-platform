# PMS Platform Agent Typed Capabilities STATUS

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`
Status file state: `ACTIVE`
Last updated: 2026-05-07

## Current State

- state: `READY`
- owner: `execution-reality-audit`
- route: `PLAN -> EXEC -> REVIEW -> REPLAN -> CLOSEOUT`
- workstream: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Current Step

- active_step: `P4`
- mode: `ready_for_execution`

## Planned Stages

- [x] `P0` agent-platform-contract-doc
- [x] `P1` capability-manifest-agent-safety-proof
- [x] `P2` typed-workflow-response-shape-proof
- [x] `P3` agent-route-sequence-local-smoke
- [ ] `P4` final-platform-agent-contract-closeout
- [ ] `PACK_COMPLETE` closeout

## Current Master Plan

- Current wave: `W5` final-audit-and-handoff
- Current wave stage: `P4` final-platform-agent-contract-closeout
- Current wave stage state: `READY`
- Best next step to execute now: `W5/P4`, because P3 accepted the exact local route-sequence smoke and the remaining proof gap is final platform-side audit plus successor handoff.
- Numbered wave ladder:
  1. `W1/P0` agent-platform-contract-foundation: platform-owned consumption contract doc and successor handoff.
  2. `W2/P1` capability-manifest-agent-safety-proof: manifest/projection tests prove agent-safe typed PMS capabilities without endpoint/auth leakage.
  3. `W3/P2` typed-workflow-response-shape-proof: response-shape tests prove draft/quote/prepare-confirm/pending-action status evidence.
  4. `W4/P3` agent-route-sequence-local-smoke: local HTTP smoke proves availability -> draft -> quote -> prepare-confirm -> pending-action status.
  5. `W5/P4` final-audit-and-handoff: reality audit, forbidden-import/static scans, successor `pms-agent-v2` residual handoff, then `PACK_COMPLETE` if accepted.
- Constraints identified: `pms-platform` must not own Pi/LLM, Feishu transport, conversation routing, generic customer-chat APIs, generic brokers, or direct natural-language final mutation.
- Missing pieces identified: workflow response-shape proof, route-sequence smoke, final audit/handoff.
- Realistic validation paths: `npm run check:boundaries`, targeted API/local sandbox tests, `npm run verify`, `git diff --check`, and `plan_sync docs/plan`.
- P4 likely code/test surfaces: `AGENTS.md`, `package.json`, `scripts/check-boundaries.mjs`, `docs/pms-agent-v2-typed-capabilities-contract-v1.md`, `packages/api/test/local-sandbox-http.test.ts`, `packages/api/test/api-contract.test.ts`, `packages/contracts/src/index.ts`, `packages/api/src/sqliteSandboxStore.ts`, and static scans across `packages/`.
- P4 linear execution steps:
  1. Reality-audit P0-P3 docs/tests/code against PMS ownership law and this plan.
  2. Static scan for forbidden Pi/Feishu/conversation imports and generic customer-chat tools.
  3. Remove slice-created redundant docs, comments, compatibility aliases, or unused helpers if found.
  4. Record successor handoff to `pms-agent-v2` only.
  5. Move parser truth to `PACK_COMPLETE` only after accepted evidence exists.
- P4 wave exit criteria before closeout handoff: all platform-side implementation slices have accepted evidence; no boundary drift/generic broker/final natural-language mutation remains; parser truth can safely move to `PACK_COMPLETE`.

## Immediate Focus

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
## Machine State

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
## Autopilot Transition Contract

- `execute/completed` dispatches same-slice `review`; do not advance `active_step` during execute.
- `review/completed` accepts the slice and performs deterministic docs/plan writeback to the next active stage.
- `review/continue` keeps `active_step` unchanged for another execute cycle.
- `needs_replan` routes to `replan`; `blocked`/`failed` stop.
- `done` routes to closeout only when the whole objective is complete and parser truth names `PACK_COMPLETE`.
- After accepted review, `README`, `STATUS`, and `WORKSET` must agree on the new active slice and intended handoff before another execute phase runs. Current accepted writeback points to `P4` / `execution-reality-audit`.

## Recently Completed

- Historical `pms-r3-api-mcp-hermes-feishu-v1` files exist in `docs/plan/` but are superseded and not active backlog.
- `pms-platform` current workspace baseline before this plan was clean on branch `main`.
- Review accepted `P0`; `docs/pms-agent-v2-typed-capabilities-contract-v1.md` exists and satisfies P0 deliverables/done_when.
- P1 execution tightened manifest/planner projection tests and `npm run verify` passed.
- Review accepted `P1`; `packages/api/test/api-contract.test.ts` now proves planner projection inclusion/exclusion and endpoint/auth redaction.
- P2 execution tightened local sandbox HTTP response-shape proof and `npm run verify` passed.
- P2 review removed raw `draftId` from pending-action read models, reran verification, accepted the slice, and advanced parser truth to P3.
- P3 execution added a local typed route-sequence smoke and `npm run verify` passed.
- P3 review accepted the route-sequence smoke after re-reading code/docs and rerunning targeted validation.

## Next Step

- Execute/review `P4` final-platform-agent-contract-closeout via `execution-reality-audit`.

## Blockers

- None known.

## Gate State

- Active pack paths are explicit in `docs/plan/README.md`.
- Active slice is singular: `P4`.
- Current handoff is `execution-reality-audit` for P4.
- Closeout forbidden until `PACK_COMPLETE` is active.

## Latest Evidence

- P3 accepted by review: `packages/api/test/local-sandbox-http.test.ts`, `docs/pms-agent-v2-typed-capabilities-contract-v1.md`
- `npm run test -- packages/api/test/local-sandbox-http.test.ts` passed during P3 review: 11 tests
- `git diff --check` passed during P3 review

## Notes

- This is a `pms-platform` plan pack. It intentionally does not edit `pms-agent-v2`.
- The successor `pms-agent-v2` work should only begin after P4 accepts platform-side evidence or after a slice explicitly exports a stable handoff.
- If this pack runs under extension autopilot, each phase ends with exactly one `autopilot_report`; active-slice phases use `stepId` equal to `active_step`.

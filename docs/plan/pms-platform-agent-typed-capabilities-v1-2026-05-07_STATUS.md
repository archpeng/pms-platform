# PMS Platform Agent Typed Capabilities STATUS

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`
Status file state: `ACTIVE`
Last updated: 2026-05-07

## Current State

- state: `IN_PROGRESS`
- owner: `execute-plan`
- route: `PLAN -> EXEC -> REVIEW -> REPLAN -> CLOSEOUT`
- workstream: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Current Step

- active_step: `P0`
- mode: `ready_for_execution`

## Planned Stages

- [ ] `P0` agent-platform-contract-doc
- [ ] `P1` capability-manifest-agent-safety-proof
- [ ] `P2` typed-workflow-response-shape-proof
- [ ] `P3` agent-route-sequence-local-smoke
- [ ] `P4` final-platform-agent-contract-closeout
- [ ] `PACK_COMPLETE` closeout

## Current Master Plan

- Current wave: `W1` agent-platform-contract-foundation
- Current wave stage: `P0` agent-platform-contract-doc
- Current wave stage state: `READY`
- Best next step to execute now: `W1/P0`, because `pms-agent-v2` cannot safely remove synthetic workflow evidence until `pms-platform` publishes the platform-owned typed capability consumption contract.
- P0 likely code/docs surfaces: `docs/`, `packages/api/src/index.ts`, `packages/api/test/api-contract.test.ts`, `packages/api/src/localSandbox.ts`, `packages/api/test/local-sandbox-http.test.ts`.
- P0 validation: `npm run check:boundaries`, `git diff --check`; docs-only edits may skip full verify, but P1-P4 require `npm run verify` after code/test changes.

## Immediate Focus

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

## Machine State

- active_step: `P0`
- latest_completed_step: `none`
- intended_handoff: `execute-plan`
- latest_plan_summary: Created platform-side parser-compatible pack for typed PMS capabilities consumed by `pms-agent-v2`.
- latest_verification:
  - `Read package-owned plan-creator skill and autopilot control-plane references.`
  - `Read pms-platform AGENTS.md, docs/plan/README.md, README.md, API manifest/local sandbox surfaces, and API contract test excerpts.`
  - `Created active PLAN/STATUS/WORKSET pack under pms-platform/docs/plan for platform-side work only.`

## Autopilot Transition Contract

- `execute/completed` dispatches same-slice `review`; do not advance `active_step` during execute.
- `review/completed` accepts the slice and performs deterministic docs/plan writeback to the next active stage.
- `review/continue` keeps `active_step` unchanged for another execute cycle.
- `needs_replan` routes to `replan`; `blocked`/`failed` stop.
- `done` routes to closeout only when the whole objective is complete and parser truth names `PACK_COMPLETE`.
- After accepted review, `README`, `STATUS`, and `WORKSET` must agree on the new active slice and intended handoff before another execute phase runs.

## Recently Completed

- Historical `pms-r3-api-mcp-hermes-feishu-v1` files exist in `docs/plan/` but are superseded and not active backlog.
- `pms-platform` current workspace baseline before this plan was clean on branch `main`.
- Current validation baseline from prior analysis: `npm run verify` passed with boundary check, build, and 11 test files / 97 tests.

## Next Step

- `P0` agent-platform-contract-doc via `execute-plan`.

## Blockers

- None known.

## Gate State

- Active pack paths are explicit in `docs/plan/README.md`.
- Active slice is singular: `P0`.
- Review route is `execution-reality-audit` after execute evidence.
- Closeout forbidden until `PACK_COMPLETE` is active.

## Latest Evidence

- `docs/plan/README.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_PLAN.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`

## Notes

- This is a `pms-platform` plan pack. It intentionally does not edit `pms-agent-v2`.
- The successor `pms-agent-v2` work should only begin after P4 accepts platform-side evidence or after a slice explicitly exports a stable handoff.
- If this pack runs under extension autopilot, each phase ends with exactly one `autopilot_report`; active-slice phases use `stepId` equal to `active_step`.

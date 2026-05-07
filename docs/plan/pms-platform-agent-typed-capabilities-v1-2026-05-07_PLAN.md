# PMS Platform Agent Typed Capabilities PLAN

Plan ID: `pms-platform-agent-typed-capabilities-v1-2026-05-07`

## Goal

Make `pms-platform` the stable typed capability source that `pms-agent-v2` can use through Pi-visible gated tools, so the Agent can rely on real PMS Platform evidence instead of local synthetic workflow evidence.

## Scope

1. Define and prove the platform-side agent consumption contract for capability manifest, planner projection, typed HTTP routes, and local sandbox responses.
2. Keep all changes inside `pms-platform`; do not edit `pms-agent-v2` in this pack.
3. Prefer current typed platform routes over new abstractions.
4. Provide enough platform evidence for a successor `pms-agent-v2` pack to remove synthetic `prepareReservationConfirm` runtime evidence.

## Non-Goals

1. No Pi/LLM runtime code in `pms-platform`.
2. No Feishu transport, card delivery, callback dedupe, or adapter code.
3. No generic HTTP broker, generic customer-chat API, workflow engine, plugin system, or multi-agent supervisor.
4. No production rollout, gray deployment, worker/outbox buildout, or secret wiring.
5. No direct mutation from natural language; typed pending-action callbacks remain the final mutation boundary.

## Deliverables

1. A platform-owned integration contract doc for `pms-agent-v2` that maps manifest capabilities, typed routes, request/response shapes, redaction rules, and non-goals.
2. Tests proving the capability manifest and planner projection expose only agent-safe typed PMS capabilities and hide endpoint/auth internals where appropriate.
3. Tests proving local sandbox reservation draft, quote, prepare-confirm, and pending-action status response shapes are stable and usable as evidence sources.
4. A minimal local platform smoke proving the exact route sequence needed by `pms-agent-v2`: availability -> draft -> quote -> prepare-confirm -> pending-action status, without final mutation.
5. Final closeout evidence and residual handoff for the successor `pms-agent-v2` pack.

## Constraints

- `pms-platform` is PMS truth owner only; it must not import Pi, Feishu SDKs, `pms-agent-v2`, or conversation runtime packages.
- `npm run verify` is the repo-local validation ladder and must keep passing.
- Existing typed route semantics, audits, idempotency, and pending-action callback boundaries must not be weakened.
- If a needed behavior already exists as a typed route, use and test it instead of adding another abstraction.
- If this pack runs under extension autopilot, each routed phase ends with exactly one `autopilot_report` and active-slice phases use `stepId` equal to the active slice ID.

## Verification

Baseline and final validation:

```bash
npm run verify
git diff --check
```

Targeted validation by slice:

1. Contract/manifest tests in `packages/api/test/api-contract.test.ts` or a focused new test.
2. Local sandbox HTTP tests in `packages/api/test/local-sandbox-http.test.ts` or a focused new smoke test.
3. Boundary check `npm run check:boundaries` after every slice that touches dependencies or API surfaces.

## Blockers / Risks

1. If `pms-agent-v2` needs a response shape that conflicts with existing PMS-owned redaction/idempotency semantics, stop and replan the cross-repo contract instead of patching around it.
2. If a route gap is discovered, add the smallest typed PMS Platform route only after proving no existing route covers the need.
3. If a fix requires Pi/LLM or Feishu ownership changes, stop and hand off to the owning repo; do not implement it here.

## Autopilot Transition Contract

- Planning phases prepare or repair parser truth; they do not claim implementation completion.
- `execute/completed` dispatches `review` for the same active slice and must not advance `Stage Order` by itself.
- `review/completed` accepts the active slice, writes completion evidence, and advances README/STATUS/WORKSET to the next stage or `PACK_COMPLETE`.
- `review/continue` keeps the same active slice for another execute cycle.
- `needs_replan` routes to `replan`; `blocked`/`failed` stops; `done` is reserved for whole-objective completion and closeout.
- Closeout uses the repo-local closeout prompt surface only after parser truth names `PACK_COMPLETE`.

## Slice Definitions

#### `P0` — agent-platform-contract-doc

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- Create the platform-owned contract that lets `pms-agent-v2` consume real typed PMS capabilities without synthetic runtime evidence or generic adapters.

交付物：

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

#### `P1` — capability-manifest-agent-safety-proof

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Prove the capability manifest and planner projection expose a safe, typed capability list for Pi/gated-tool planning without leaking endpoint/auth execution details to the Agent planner.

交付物：

1. Focused tests around `getPmsCapabilityManifest()` / `getPmsCapabilityPlannerProjection()` for agent-safe capabilities.
2. Proof that read/draft/prepare-confirm capabilities are natural-language executable where safe, while confirm/internal capabilities are excluded from planner projection.
3. Proof that planner projection omits endpoint paths and bearer-auth details.

done_when:

1. Tests prove availability and reservation draft/quote/prepare-confirm appear in planner projection.
2. Tests prove pending-action confirm/cancel and confirm-class capabilities do not appear in planner projection.
3. `npm run verify` passes.

stop_boundary:

1. Stop if making planner projection useful requires exposing endpoint/auth details to Pi.
2. Stop if a natural-language executable flag would imply direct final PMS mutation.
3. Stop if tests require adding a generic capability DSL beyond the current manifest.

必须避免：

1. Do not add Pi-specific types or imports.
2. Do not weaken current capability classes, confirmation flags, audit metadata, or idempotency metadata.

#### `P2` — typed-workflow-response-shape-proof

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Prove the typed reservation workflow responses can replace `pms-agent-v2` synthetic workflow evidence without exposing raw platform internals as Agent truth.

交付物：

1. Tests for reservation draft create/update/quote/prepare-confirm response shape in the local sandbox/API path.
2. Tests for pending-action status response shape and no-final-mutation prepare-confirm behavior.
3. If response names differ from `pms-agent-v2` client expectations, document the exact platform-owned names and add a successor handoff note instead of adding compatibility aliases blindly.

done_when:

1. A local sandbox/API test proves draft -> quote -> prepare-confirm returns stable redacted refs and `mutationStatus=none` or equivalent platform-owned no-final-mutation semantics.
2. A pending-action status test proves status can be read without confirm/cancel side effects.
3. `npm run verify` passes.

stop_boundary:

1. Stop if satisfying agent expectations requires exposing raw `draftId`, raw quote refs, guest PII, or raw card payload refs to the conversation layer.
2. Stop if passing tests requires adding old/new compatibility aliases instead of one platform contract.
3. Stop if final mutation becomes reachable from natural-language workflow routes.

必须避免：

1. Do not add response fields solely to match a local synthetic `pms-agent-v2` stub.
2. Do not bypass existing draft store, idempotency, audit, or pending-action semantics.

#### `P3` — agent-route-sequence-local-smoke

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Prove the exact local route sequence that `pms-agent-v2` should call through typed gated tools, using only `pms-platform` local sandbox HTTP surfaces.

交付物：

1. Focused smoke or extension of local sandbox HTTP tests for availability -> draft -> quote -> prepare-confirm -> pending-action status.
2. Evidence that no pending-action confirm/cancel or room/reservation mutation happens during the natural-language prepare-confirm route sequence.
3. Documentation update linking the smoke to the P0 contract.

done_when:

1. The route sequence succeeds against local sandbox HTTP with bearer auth and typed request bodies.
2. The smoke proves no final mutation occurs before typed pending-action callback.
3. `npm run verify` and `git diff --check` pass.

stop_boundary:

1. Stop if smoke requires live Feishu, Pi, `pms-agent-v2`, or production secrets.
2. Stop if local sandbox behavior diverges from documented typed API contracts.
3. Stop if route sequence requires adding a generic orchestration endpoint.

必须避免：

1. Do not build an agent simulator inside `pms-platform`.
2. Do not add cross-repo imports or fixtures from `pms-agent-v2`.

#### `P4` — final-platform-agent-contract-closeout

- Owner: `execution-reality-audit`
- State: `QUEUED`
- Priority: `high`

目标：

- Audit the platform-side contract, remove residue, and prepare terminal handoff to a successor `pms-agent-v2` implementation pack.

交付物：

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

#### `PACK_COMPLETE` — closeout

- Owner: `autopilot-closeout`
- State: `DEFERRED`
- Priority: `terminal`

目标：

- Close this platform-side pack after P4 accepted review marks the objective complete.

交付物：

1. Closeout summary.
2. Final evidence and successor handoff to `pms-agent-v2`.
3. Hot/cold plan hygiene update.

done_when:

1. Pack is terminal and no active implementation/review work remains.

stop_boundary:

1. If any non-terminal slice remains active, hand back to that slice; do not close out.

必须避免：

1. Do not use closeout to skip P4 final audit.

## Master 推进纲领

Repository constraints identified for this pack:

1. `pms-platform` is the PMS truth/read-model owner only; Pi/LLM runtime, Feishu transport, and conversation routing stay outside this repo.
2. Existing typed API/local-sandbox surfaces already cover the intended agent handoff path; this pack should cite and prove them before adding any route.
3. Planner projection is advisory for safe natural-language planning; final PMS mutation remains typed pending-action callback behavior.
4. Validation must stay realistic and local: boundary check for docs/API ownership, targeted API/local sandbox tests for capability behavior, full `npm run verify` after code/test changes, and `git diff --check` after every slice.

Known missing pieces to close through waves:

1. A single platform-owned `pms-agent-v2` consumption contract doc under `docs/`.
2. Focused proof that manifest/planner projection is agent-safe while hiding endpoint/auth details from planner truth.
3. Focused proof that draft/quote/prepare-confirm/pending-action responses are stable enough to replace synthetic agent workflow evidence.
4. A local HTTP route-sequence smoke for availability -> draft -> quote -> prepare-confirm -> pending-action status.
5. Final audit/handoff proving no platform-side route gap remains before successor `pms-agent-v2` wiring.

## Wave Ladder

1. `W1` agent-platform-contract-foundation: execute and review `P0`; output is the platform-owned consumption contract doc and successor handoff.
2. `W2` capability-manifest-agent-safety-proof: execute and review `P1`; output is manifest/projection test evidence.
3. `W3` typed-workflow-response-shape-proof: execute and review `P2`; output is stable draft/quote/prepare-confirm/pending-action response evidence.
4. `W4` agent-route-sequence-local-smoke: execute and review `P3`; output is the end-to-end local sandbox route sequence proof.
5. `W5` final-audit-and-handoff: execute and review `P4`, then advance to `PACK_COMPLETE` only if P0-P3 have accepted review evidence.

Best first wave now: `W1/P0`, because `pms-agent-v2` cannot safely replace synthetic `prepareReservationConfirm` evidence until the platform contract names the real typed routes, authority boundaries, redaction rules, and non-goals.

Accepted-review progression is strictly one wave at a time: `P0 -> P1 -> P2 -> P3 -> P4 -> PACK_COMPLETE`.

## Exit Criteria

- `docs/plan/README.md`, PLAN, STATUS, and WORKSET agree on active slice and handoff.
- Active and queued slices carry concrete `done_when` / `stop_boundary`.
- Review handoff remains `execution-reality-audit`; closeout remains repo-local `autopilot-closeout`.
- The pack remains scoped to `pms-platform` and does not implement `pms-agent-v2` wiring.

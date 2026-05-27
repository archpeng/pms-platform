# PMS Agent v2 Typed Capabilities Contract

Contract ID: `pms-agent-v2-typed-capabilities-contract-v1`
Owner: `pms-platform`
Consumer: `pms-agent-v2`
Status: platform-side P4 handoff contract, local/sandbox evidence complete

## Purpose

This document names the PMS Platform surfaces that `pms-agent-v2` may consume through typed gated tools. It is not a new API surface. It is a platform-owned contract over existing typed routes, response authority, redaction rules, and handoff limits.

The contract lets `pms-agent-v2` replace synthetic or looploop-orchestrated booking evidence with real PMS Platform create/prepare/adjust evidence while keeping Agent-initiated final booking mutation behind typed pending-action confirmation.

## Ownership Boundary

`pms-platform` owns PMS domain truth, typed read models, native reservation create/adjust/prepare workflows, reservation draft workflow state, pending-action semantics, audits, idempotency, and local sandbox HTTP truth.

`pms-platform` does not own:

1. Pi/LLM runtime, semantic routing, prompts, or PlanCompiler/tool-planning execution.
2. Feishu transport, cards, callbacks transport, allowlists, or dedupe.
3. Conversation continuity or user-facing reply policy.
4. Generic HTTP brokers, arbitrary customer-chat endpoints, plugin systems, shell/file/SQL tools, or multi-agent supervisors.
5. Production rollout, live secret wiring, or adapter deployment.

Source authority:

- Boundary policy: `AGENTS.md`.
- Repository boundary notes: `README.md`.
- Capability manifest and API types: `packages/api/src/index.ts`.
- Local sandbox HTTP route authority: `packages/api/src/localSandbox.ts`.
- Manifest/API proof tests: `packages/api/test/api-boundary.test.ts`.
- Local HTTP proof tests: `packages/api/test/local-http-workflow.test.ts`.
- Group booking/materialization proof tests: `packages/api/test/golden-group-booking-e2e.test.ts` and `packages/api/test/sqlite-workflow-store.test.ts`.

## Contracted Local HTTP Surfaces

All local HTTP routes below are fixed typed PMS Platform routes. They require local bearer auth in the sandbox handler; `pms-agent-v2` should receive route metadata from its own gated-tool configuration, not from the planner projection.

| Consumer need | Operation | Local HTTP route | Response authority | Proof sources |
| --- | --- | --- | --- | --- |
| Capability discovery | `pms_capabilities_manifest` | `GET /v1/pms/capabilities/manifest` | `PmsCapabilityManifest`, including sanitized planner projection | `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/api-boundary.test.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Availability evidence | `pms_availability_search` | `POST /v1/pms/availability/search` | `AvailabilitySearchReadModel` from inventory/read-model truth | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/api-boundary.test.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Reservation draft create | `pms.reservation.draft.create` | `POST /v1/pms/reservation-drafts/create` | `ReservationDraftWorkflowApiResponse` with redacted `draftRef` and `mutationStatus=draftOnly` | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Reservation draft update | `pms.reservation.draft.update` | `POST /v1/pms/reservation-drafts/update` | `ReservationDraftWorkflowApiResponse` continuing from redacted `draftRef` | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Reservation quote | `pms.reservation.quote` | `POST /v1/pms/reservation-drafts/quote` | `ReservationDraftWorkflowApiResponse`; current quote may carry platform-owned capability gap such as `RESERVATION_QUOTE_PRICING_UNSUPPORTED` | `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Prepare confirmation | `pms.reservation.prepare_confirm` | `POST /v1/pms/reservation-drafts/prepare-confirm` | `ReservationDraftWorkflowApiResponse` with pending-action evidence, `confirmationMode=typedCardOnly`, and no final mutation | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Reservation draft cancel | `pms.reservation.draft.cancel` | `POST /v1/pms/reservation-drafts/cancel` | `ReservationDraftWorkflowApiResponse` closing a draft without final reservation mutation | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Reservation group draft create/update/quote/prepare-confirm | `pms.reservation.group_draft.*` | `POST /v1/pms/reservation-group-drafts/{create,update,quote,prepare-confirm}` | `ReservationGroupDraftWorkflowApiResponse` with redacted `groupDraftRef`, group quote evidence, and typed-card-only pending-action evidence | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts`; `packages/api/test/golden-group-booking-e2e.test.ts` |
| Reservation group draft cancel | `pms.reservation.group_draft.cancel` | `POST /v1/pms/reservation-group-drafts/cancel` | `ReservationGroupDraftWorkflowApiResponse` closing a group draft without final reservation mutation | `README.md`; `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/sqlite-workflow-store.test.ts` |
| Direct reservation create | `pms.reservation.create` | `POST /v1/pms/reservations/create` | `ReservationCreateApiResponse` with committed/replayed/rejected result, reservation read model, allocation write, inventory refresh, and idempotency conflict handling | `packages/api/src/reservationCreateWorkflowApi.ts`; `packages/api/src/sqliteSandbox/reservationCreateStore.ts`; `packages/api/test/local-http-reservation-create-workflow.test.ts`; `packages/api/test/sqlite-reservation-create-store.test.ts` |
| Native single booking prepare | `pms.reservation.prepare_booking` | `POST /v1/pms/reservations/prepare-booking` | `ReservationCreateApiResponse` wrapping draft/quote/prepare-confirm as one PMS-owned preparation; returns pending-action evidence and does not create a final reservation | `packages/api/src/reservationCreateWorkflowApi.ts`; `packages/api/src/sqliteSandbox/reservationCreateStore.ts`; `packages/api/test/local-http-reservation-create-workflow.test.ts`; `packages/api/test/sqlite-reservation-create-store.test.ts` |
| Native group booking prepare | `pms.reservation.group_prepare_booking` | `POST /v1/pms/reservation-groups/prepare-booking` | `ReservationCreateApiResponse` wrapping availability, room selection, group draft, quote, and prepare-confirm as one PMS-owned preparation; returns pending-action evidence and does not create final reservations before callback confirm | `packages/api/src/reservationCreateWorkflowApi.ts`; `packages/api/src/sqliteSandbox/reservationCreateStore.ts`; `packages/api/test/local-http-reservation-create-workflow.test.ts`; `packages/api/test/sqlite-reservation-create-store.test.ts` |
| Reservation adjustment | `pms.reservation.adjust` | `POST /v1/pms/reservations/adjust` | `ReservationAdjustApiResponse` with committed/replayed/rejected result; validates the original reservation and target availability, replaces the booking atomically, refreshes inventory, and guards idempotency conflicts | `packages/api/src/reservationAdjustWorkflowApi.ts`; `packages/api/src/sqliteSandbox/reservationAdjustStore.ts`; `packages/api/test/local-http-workflow.test.ts`; `packages/api/test/sqlite-reservation-adjust-store.test.ts` |
| Pending-action status readback | `pms.pending_action.status` | `POST /v1/pms/pending-actions/status` | `PendingActionCallbackApiResponse` with `mutationStatus=none` for status read | `packages/api/src/index.ts`; `packages/api/src/localSandbox.ts`; `packages/api/test/local-http-workflow.test.ts` |
| Pending-action confirm callback | `pms.pending_action.confirm` | `POST /v1/pms/pending-actions/confirm` | Single-room and group callbacks materialize final reservations with `mutationStatus=committed` | `packages/api/src/sqliteSandbox/pendingActionStore.ts`; `packages/api/test/local-http-workflow.test.ts`; `packages/api/test/golden-group-booking-e2e.test.ts`; `packages/api/test/projection-dispatcher.test.ts` |
| Pending-action cancel callback | `pms.pending_action.cancel` | `POST /v1/pms/pending-actions/cancel` | Callback cancellation records the pending-action cancellation with `mutationStatus=none` | `packages/api/src/sqliteSandbox/pendingActionStore.ts`; `packages/api/test/local-http-workflow.test.ts`; `packages/api/test/sqlite-workflow-store.test.ts` |

The typed callback routes `POST /v1/pms/pending-actions/confirm` and `POST /v1/pms/pending-actions/cancel` exist as PMS Platform callback-result routes, but they are not natural-language planner actions. They are transport/callback handoff surfaces and must not be exposed as direct conversation tools.

## Capability Manifest and Planner Projection

The manifest is the platform authority for capability metadata. In `packages/api/src/index.ts`, `getPmsCapabilityManifest()` returns:

1. `schemaVersion=pms-capability-manifest-v1`.
2. Full capability items including endpoint metadata for trusted platform/gated-tool wiring.
3. `plannerProjection` from `getPmsCapabilityPlannerProjection()`.

The planner projection is advisory only. It filters to capabilities that are `customerChatAllowed`, `naturalLanguageExecutable`, not `confirmationRequired`, not class `confirm`, and not class `internal`; it also strips the `endpoint` field before exposing planner data.

Current tests prove that the projection omits `/v1/pms/` paths and `bearer-token`, includes safe read and PMS-owned prepare capabilities such as `pms_availability_search`, `pms.reservation.prepare_booking`, `pms.reservation.group_prepare_booking`, and the lower-level draft/quote/prepare-confirm compatibility capabilities, and excludes confirm/internal routes such as pending-action confirm/cancel and manifest/reset internals.

`pms-agent-v2` may use planner projection to decide whether a user request has a safe typed PMS capability candidate. It must not treat planner projection as route execution authority, authentication authority, or final mutation authority.

## Reservation Evidence and Redaction Rules

Agent-visible PMS evidence is limited to typed read models and redacted workflow references returned by the contracted routes.

Allowed evidence for `pms-agent-v2` successor wiring:

1. Availability candidates and source refs returned by `AvailabilitySearchReadModel`.
2. Redacted `draftRef` returned by draft create/update/quote/prepare-confirm responses.
3. Platform-owned quote status/capability-gap fields returned by `pms.reservation.quote`.
4. Pending-action status summaries returned by prepare-confirm/status routes, including `confirmationMode=typedCardOnly` and mutation status.
5. Native prepare-booking responses that include the pending-action evidence and selected PMS room context without committing a final reservation.
6. Direct create/adjust committed reservation read models for trusted server-side callers, never as planner-invented truth.
7. Operation names, schema refs, classes, and slot metadata from the capability manifest/projection.

Not agent-owned and not planner truth:

1. Raw `draftId`.
2. Raw quote internals beyond platform-returned redacted response fields.
3. Raw pending-action storage records.
4. Raw card payload refs except as callback-bound redacted refs returned by typed pending-action surfaces.
5. Guest PII or raw platform payload dumps.
6. Bearer tokens, local secret values, endpoint auth details in planner projection.
7. Sandbox readback/reset data as customer-chat evidence.

`README.md` already states that customer-chat callers may resume draft update/quote/prepare-confirm with redacted `draftRef`, while raw `draftId` remains platform-internal for sandbox readback/debug only.

## Mutation Boundary

Natural-language execution may collect slots, read PMS truth, and prepare typed confirmation through native prepare routes (`pms.reservation.prepare_booking`, `pms.reservation.group_prepare_booking`). The lower-level draft create/update/quote/prepare-confirm routes remain compatibility/debug surfaces. Natural-language execution must not perform final PMS mutation.

Final Agent reservation mutation remains a typed pending-action callback boundary. The native prepare-booking path creates draft/pending-action state with `mutationStatus=none` or `draftOnly`; final confirm/cancel must arrive through typed callback transport. For single-room and group reservation drafts, confirm materializes booked reservation records and room allocations with `mutationStatus=committed`. Trusted server-side direct create (`pms.reservation.create`) and committed reservation adjustment (`pms.reservation.adjust`) are PMS-native mutation routes for authorized BFFs, not natural-language planner routes. Cancel callback/status paths remain non-committing with `mutationStatus=none`.

The local HTTP tests prove:

1. Reservation draft create/update/quote/prepare-confirm returns redacted draft refs and no raw `draftId` in customer-facing responses.
2. Prepare-confirm returns `confirmationMode=typedCardOnly` and pending-action `mutationStatus=none`.
3. Pending-action status returns `mutationStatus=none`.
4. Single-room and group pending-action confirm return `mutationStatus=committed`, create booked reservation records and room allocations, and emit reservation projection outbox work.
5. Rooms, operation requests, audits, and domain events remain unchanged during draft, draft-cancel, pending-action cancel, and status-only paths.
6. `packages/api/test/local-http-workflow.test.ts` includes agent route-sequence smoke coverage for `availability/search -> reservation-drafts/create -> reservation-drafts/update -> reservation-drafts/quote -> reservation-drafts/prepare-confirm -> pending-actions/status`; it uses only authenticated local typed HTTP routes and stops before confirm/cancel.
7. Native direct create commits reservation/allocation/inventory in one transaction and replays/rejects idempotency correctly.
8. Native single/group prepare-booking returns pending-action evidence without final reservation mutation, while pending-action confirm remains the commit boundary.

## Expected `pms-agent-v2` Route Sequence

Successor `pms-agent-v2` first-party booking work should use these PMS-native typed route sequences:

1. `GET /v1/pms/capabilities/manifest` to load platform capability metadata and planner projection.
2. `POST /v1/pms/reservations/prepare-booking` for single-room Agent booking preparation, or `POST /v1/pms/reservation-groups/prepare-booking` for group booking preparation. PMS owns availability search, room selection, draft/quote/prepare-confirm, idempotency, and pending-action creation behind that one call.
3. `POST /v1/pms/pending-actions/status` to read pending-action state without confirm/cancel side effects.
4. `POST /v1/pms/pending-actions/confirm` only from the typed-card callback transport to commit final reservations.

The lower-level route sequence `availability/search -> reservation-drafts/create/update -> quote -> prepare-confirm -> pending-actions/status` remains a compatibility/debug surface and proof fixture, but first-party Agent booking preparation should not orchestrate it outside PMS Platform.

This sequence is local/sandbox contract truth only. It does not promise production readiness, live secret wiring, rollout state, Feishu card delivery, or agent-side tool implementation.

## Successor Handoff for `pms-agent-v2`

Ready platform surfaces to consume after this slice:

1. Capability manifest route and sanitized planner projection.
2. Availability search route backed by PMS inventory/read-model truth.
3. Native single/group prepare-booking routes that return pending-action evidence without final mutation.
4. Direct create/adjust routes for trusted server-side callers that need committed PMS mutations after authorization/safety.
5. Reservation draft create/update/quote/prepare-confirm routes using redacted refs for compatibility/debugging.
6. Pending-action status route for readback without final mutation.
7. Existing proof tests showing endpoint/auth details are omitted from planner projection and draft/status/native-prepare paths do not perform final mutation.

Successor `pms-agent-v2` should:

1. Wire typed gated tools to the contracted native prepare routes instead of synthetic local workflow evidence or looploop-owned draft orchestration.
2. Keep route/auth execution authority in gated tool configuration, not in LLM planner projection.
3. Treat planner projection as advisory capability metadata only.
4. Persist only allowed redacted refs and typed read-model summaries needed for conversation continuity.
5. Leave typed-card callback transport, Feishu delivery, and callback dedupe to the owning transport/adapter layer.

Platform-side P4 proof is complete for this local/sandbox contract:

1. Final platform-side audit and successor handoff are represented by this contract and the proof tests listed above.

## Non-Goals

1. No `pms-agent-v2` code is implemented inside the `pms-platform` repository.
2. No Pi package imports or LLM runtime inside `pms-platform`.
3. No Feishu SDK, card delivery, callback transport, allowlist, or dedupe implementation.
4. No generic customer-chat endpoint, broker, SQL/file/shell tool, or arbitrary projection surface.
5. No final mutation from natural-language workflow routes.
6. No compatibility aliases for synthetic agent stubs.
7. No production deployment, live secret wiring, rollout, or SLA claim.

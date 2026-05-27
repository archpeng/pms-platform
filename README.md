# PMS Platform

PMS Platform is the PMS-owned codebase for hotel PMS business truth, state transitions, audit semantics, idempotency, and future service surfaces.

## Ownership boundary

- PMS Core owns PMS facts and business state-machine behavior.
- `adapter-feishu` remains an independent Feishu/Lark channel adapter.
- Hermes remains an AI operator/runtime.
- Feishu remains a human collaboration surface.

## Current bootstrap proof

The workspace now contains a verified first PMS Core `CHECK_OUT` proof:

- `packages/contracts` defines the command, room state, housekeeping task, audit, event, and stable error contracts.
- `packages/core` implements dry-run checkout planning and confirmed checkout execution.
- Confirmed checkout transitions checkoutable rooms to `occupancyStatus=vacant`, `cleaningStatus=dirty`, and preserves sale status.
- Confirmed checkout creates a checkout-cleaning task, audit entry, `RoomCheckedOut` event, and `HousekeepingTaskCreated` event.
- Confirmed checkout uses idempotency to prevent duplicate task/audit/event writes for repeated command keys.

The original checkout bootstrap has since grown local HTTP APIs, SQLite-backed workflow persistence, projection outbox proof, and reservation workflows. Feishu integration, Hermes MCP integration, production workers, live rollout wiring, and non-local service deployment remain outside this repository's current proof boundary.

## Room-type read-model boundary

Room-type truth is platform-owned. Availability search derives candidate room types from inventory/read-model fields such as `roomTypeId`, `roomType`, and source references; callers must not fabricate room types from user keywords. The current local small-hotel profile/seed data still contains PMS-owned hardcoded room-type maps for `花园别墅`, `花园套房`, and `秘境洞穴`; that is a platform seed/profile residual, not `ai-conversation` business logic.

## Reservation draft continuation boundary

Reservation workflow APIs are platform-owned. Customer-chat callers should use native prepare routes (`pms.reservation.prepare_booking` / `pms.reservation.group_prepare_booking`) for booking confirmation-card preparation; the lower-level draft update, quote, and prepare-confirm routes remain platform-owned compatibility/debug surfaces. Raw `draftId` remains platform-internal for sandbox readback/debug only. `ai-conversation` must not persist PMS draft truth, raw draft IDs, raw quote refs, raw pending-action refs, raw card payload refs, guest PII, or raw platform payloads. Agent booking preparation still creates draft/pending-action state with `mutationStatus=none` or `draftOnly`; final Agent reservation mutation remains a typed-card callback boundary. Trusted server-side direct create uses `pms.reservation.create`, which commits reservation/allocation/inventory truth in one PMS transaction with idempotency.

Pending-action `confirm` currently persists single-room and group draft pending actions as `status=confirmed` with `mutationStatus=committed`. Confirm materializes final reservation records, room allocations, audits/domain events, and projection outbox work. Pending-action `cancel` and status readback remain non-committing callback/status paths with `mutationStatus=none`.

## Documentation

- `packages/core/README.md` explains the core command behavior, transition matrix, errors, events, audit, and idempotency semantics.
- `docs/checkout-core-v1.md` is the handoff proof for future PMS API/MCP exposure.
- `docs/pms-base-provisioning-v1.md` identifies `packages/provisioning/src/index.ts` as the PMS-owned SSOT for the Chinese Feishu Base table/view/form/field definition.

## Validation

```bash
npm install
npm run verify
```

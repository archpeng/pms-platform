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

Out of current bootstrap scope: Feishu integration, Hermes MCP integration, HTTP APIs, workers, persistence, durable outbox, and broader PMS workflows beyond the first `CHECK_OUT` proof.

## Documentation

- `packages/core/README.md` explains the core command behavior, transition matrix, errors, events, audit, and idempotency semantics.
- `docs/checkout-core-v1.md` is the handoff proof for future PMS API/MCP exposure.

## Validation

```bash
npm install
npm run verify
```

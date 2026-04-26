# Checkout Core v1 Proof

This document is the handoff note for the first PMS Core `CHECK_OUT` proof. It is intended for the next implementer who exposes this behavior through PMS API/MCP surfaces.

## Current proof status

Implemented package surfaces:

- `packages/contracts/src/index.ts`
- `packages/core/src/index.ts`
- `packages/core/test/core.test.ts`
- `packages/core/README.md`

Validation command:

```bash
npm run verify
```

Latest S6 verification evidence:

```text
2 test files passed
19 tests passed
```

## Boundary

PMS Core owns:

- PMS room state transitions.
- Checkout command validation.
- Housekeeping checkout-cleaning task creation.
- Audit entry shape and write requirement.
- Domain event shape and collection.
- Idempotent confirmed command execution.

The bootstrap proof does not implement:

- HTTP handlers.
- MCP tools.
- Feishu projection or notification.
- Hermes tool wiring.
- Database migrations, Postgres persistence, or durable outbox.
- Full reservation/payment/OTA workflow.

## CHECK_OUT command contract

Command type:

```ts
type: 'CHECK_OUT'
```

Required command metadata:

| Field | Required behavior |
|---|---|
| `actor` | Must include actor id and type. Copied to audit and events. |
| `source` | Identifies command origin. Copied to audit. |
| `reason` | Must be non-empty. Copied to task and audit. |
| `idempotencyKey` | Must be non-empty. Used to deduplicate confirm execution. |
| `correlationId` | Must be non-empty. Copied to task, audit, and events. |
| `requestedAt` | Must parse as an ISO-8601 timestamp. Used as created/occurred time. |
| `mode` | Must be `dryRun` or `confirm`. |

## Checkout transition matrix

| Input occupancy | Input cleaning | Input sale | Mode | Expected output |
|---|---|---|---|---|
| `dueOut` | `clean` or `dirty` | any supported sale status | `dryRun` | `ok: true`; structural plan only; next occupancy `vacant`; next cleaning `dirty`; sale unchanged; no ports mutate. |
| `occupied` | `clean` or `dirty` | any supported sale status | `dryRun` | `ok: true`; structural plan only; next occupancy `vacant`; next cleaning `dirty`; sale unchanged; no ports mutate. |
| `vacant` | `clean` or `dirty` | any supported sale status | `dryRun` | `ok: false`; `ROOM_NOT_CHECKOUTABLE`; no ports mutate. |
| missing room | n/a | n/a | `dryRun` | `ok: false`; `ROOM_NOT_FOUND`; no ports mutate. |
| `dueOut` | `clean` or `dirty` | any supported sale status | `confirm` | `ok: true`; room saved as `vacant` + `dirty`; sale unchanged; checkout-cleaning task saved; audit appended; two events appended; idempotency result saved. |
| `occupied` | `clean` or `dirty` | any supported sale status | `confirm` | `ok: true`; room saved as `vacant` + `dirty`; sale unchanged; checkout-cleaning task saved; audit appended; two events appended; idempotency result saved. |
| `vacant` | `clean` or `dirty` | any supported sale status | `confirm` | `ok: false`; `ROOM_NOT_CHECKOUTABLE`; no confirm writes. |
| missing room | n/a | n/a | `confirm` | `ok: false`; `ROOM_NOT_FOUND`; no confirm writes. |

Supported sale status is preserved exactly. No current checkout policy changes sale status.

## Confirm side effects

A successful confirmed checkout creates exactly:

1. One room state mutation:
   - `occupancyStatus: 'vacant'`
   - `cleaningStatus: 'dirty'`
   - `saleStatus`: unchanged from the prior room.
2. One `checkout-cleaning` housekeeping task with `pending` status.
3. One audit entry containing actor, source, reason, idempotency key, correlation id, and timestamp.
4. One `RoomCheckedOut` domain event.
5. One `HousekeepingTaskCreated` domain event.
6. One idempotency record for the command result.

Duplicate `idempotencyKey` behavior:

- returns the stored prior result;
- does not re-read invalid current room state into a new failure;
- does not create duplicate tasks, audits, events, or room writes.

Current bootstrap idempotency is command-result reuse. The R3 persistence/API layer should add a request-fingerprint column or equivalent guard before allowing the same key with a different payload.

## Error surface

Stable error codes currently covered by contracts and tests:

- `MISSING_COMMAND_META`
- `MISSING_REASON`
- `MISSING_IDEMPOTENCY_KEY`
- `MISSING_CORRELATION_ID`
- `MISSING_ACTOR`
- `INVALID_REQUESTED_AT`
- `INVALID_EXECUTION_MODE`
- `ROOM_NOT_FOUND`
- `ROOM_NOT_CHECKOUTABLE`

API/MCP should expose these codes without translating them into prose-only failures.

## Test map

| Proof | Test location |
|---|---|
| Contract metadata validation and event payload shape | `packages/contracts/test/contracts.test.ts` |
| Room aggregate/status semantics and state mapping | `packages/core/test/core.test.ts` |
| Dry-run dueOut transition plan with no mutation | `packages/core/test/core.test.ts` |
| Dry-run occupied transition plan preserving sale status | `packages/core/test/core.test.ts` |
| Dry-run non-checkoutable/missing-room errors | `packages/core/test/core.test.ts` |
| Metadata errors and unsupported mode | `packages/core/test/core.test.ts` |
| Confirm dueOut transition with task/audit/events | `packages/core/test/core.test.ts` |
| Confirm occupied transition preserving sale status | `packages/core/test/core.test.ts` |
| Duplicate idempotency prevents repeated side effects | `packages/core/test/core.test.ts` |
| Invalid confirm metadata and invalid room state | `packages/core/test/core.test.ts` |
| Replaceable in-memory ports and defensive copies | `packages/core/test/core.test.ts` |

## R3 successor recommendation: PMS API/MCP tool exposure

Recommended next scope:

1. Add API/MCP package surfaces that depend on `@pms-platform/contracts` and `@pms-platform/core`.
2. Expose `CHECK_OUT` as a dry-run-first operation and a separate confirm operation.
3. Pass through contract error codes and structured dry-run/confirm results unchanged.
4. Add command-level request fingerprinting for idempotency before durable persistence is introduced.
5. Keep the same `CorePorts` boundary so Postgres repositories can replace in-memory ports later.
6. Add tests proving API/MCP handlers call PMS Core rather than duplicating checkout rules.

Explicitly out of the next R3 scope unless the core proof remains stable after review:

- Feishu projection/notification.
- Hermes tool configuration.
- Workflow expansion beyond `CHECK_OUT`.
- Durable outbox and worker dispatch.

## Closeout note

The active orchestration pack still lives in `adapter-feishu/docs/plan/*`. Once S6 review accepts this proof, the closeout prompt surface can archive the pack and hand future PMS-owned work to `pms-platform/docs/plan/*` or a successor active pack.

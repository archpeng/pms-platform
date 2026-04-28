# @pms-platform/core

`@pms-platform/core` owns deterministic PMS business behavior. The current proved MVP commands/read models are `CHECK_OUT`, `CHECK_IN`, `pms_get_room`, and `pms_dashboard`.

## Public command surface

```ts
checkOut(command: CheckOutCommand, ports: CorePorts): CheckOutResult
checkIn(command: CheckInCommand, ports: CorePorts): CheckInResult
getRoomReadModel(roomId: string, ports: CorePorts, generatedAt: string): RoomReadModel
getDashboardReadModel(ports: CorePorts, generatedAt: string): DashboardReadModel
```

Inputs are contract-owned types from `@pms-platform/contracts`:

- `CheckOutCommand`
- `CheckInCommand`
- `CommandMeta`
- `RoomReadModel` / `DashboardReadModel`
- `CommandProjection`
- `RoomState` / `RoomStatus`
- `HousekeepingTask`
- `AuditEntry`
- `DomainEvent`
- `DomainError`

`CorePorts` keeps storage replaceable:

- `rooms`
- `housekeepingTasks`
- `audits`
- `idempotency`
- `events`

The bootstrap implementation uses in-memory port implementations for proof and tests. Future persistence should replace ports without changing command semantics.

## Required command metadata

`command.meta` must include:

| Field | Meaning |
|---|---|
| `actor` | User, automated actor, or system actor requesting the command. |
| `source` | Command source such as `api`, `mcp`, `worker`, or `test`. |
| `reason` | Human-readable business reason for the PMS command. |
| `idempotencyKey` | Stable key for preventing duplicate confirmed execution. |
| `correlationId` | Trace key shared by result, audit, and events. |
| `requestedAt` | ISO-8601 request timestamp. |
| `mode` | `dryRun` or `confirm`. |

Metadata validation returns stable `DomainError` values before room mutation.

## State transition matrix

`CHECK_OUT` is allowed only for checkoutable occupancy states. `CHECK_IN` is allowed only for vacant/sellable rooms that are clean, unless the caller explicitly sets the dirty-room override flag.

| Current occupancy | Current cleaning | Current sale | Mode | Result |
|---|---|---|---|---|
| `dueOut` | any supported value | any supported value | `dryRun` | Returns structural plan: next occupancy `vacant`, next cleaning `dirty`, sale unchanged. No ports mutate. |
| `occupied` | any supported value | any supported value | `dryRun` | Returns structural plan: next occupancy `vacant`, next cleaning `dirty`, sale unchanged. No ports mutate. |
| `vacant` | any supported value | any supported value | `dryRun` | Fails with `ROOM_NOT_CHECKOUTABLE`. No ports mutate. |
| missing room | n/a | n/a | `dryRun` | Fails with `ROOM_NOT_FOUND`. No ports mutate. |
| `dueOut` | any supported value | any supported value | `confirm` | Saves room as occupancy `vacant`, cleaning `dirty`, sale unchanged; creates task/audit/events; stores idempotency result. |
| `occupied` | any supported value | any supported value | `confirm` | Saves room as occupancy `vacant`, cleaning `dirty`, sale unchanged; creates task/audit/events; stores idempotency result. |
| `vacant` | any supported value | any supported value | `confirm` | Fails with `ROOM_NOT_CHECKOUTABLE`. No ports mutate. |
| missing room | n/a | n/a | `confirm` | Fails with `ROOM_NOT_FOUND`. No ports mutate. |
| `vacant` | `clean` | `sellable` | `CHECK_IN dryRun` | Returns structural plan: next occupancy `occupied`, cleaning/sale unchanged. No ports mutate. |
| `vacant` | `clean` | `sellable` | `CHECK_IN confirm` | Saves room as occupancy `occupied`; creates audit/event; stores idempotency result. |
| `vacant` | `dirty` | `sellable` | `CHECK_IN dryRun` without override | Fails with `ROOM_NOT_CHECKIN_ELIGIBLE`. No ports mutate. |
| `vacant` | `dirty` | `sellable` | `CHECK_IN dryRun` with override | Returns structural plan with `DIRTY_ROOM_OVERRIDE_APPROVED`; no ports mutate. |
| non-vacant or stop-sell | any supported value | any non-sellable value | `CHECK_IN dryRun/confirm` | Fails with `ROOM_NOT_CHECKIN_ELIGIBLE`. No ports mutate. |

## Read-model result

`getRoomReadModel` returns one room's PMS-owned room state plus housekeeping task summaries and freshness metadata.

`getDashboardReadModel` returns PMS-owned counts for total rooms, vacant clean/dirty, in-house, due-out, stop-sell, and queue counters. Read models do not mutate ports.

## Dry-run result

For `meta.mode === 'dryRun'`, success returns:

- `mode: 'dryRun'`
- current room status
- next room status
- checkout housekeeping task preview when command is `CHECK_OUT`
- planned event names
- reason, correlation id, idempotency key, requested timestamp, and actor

Dry-run must not call repository `save`, audit append, idempotency save, or event append.

## Confirm result

For `meta.mode === 'confirm'`, success returns:

- `mode: 'confirm'`
- previous room status
- next room status
- one checkout-cleaning housekeeping task
- one audit entry
- `RoomCheckedOut` event
- `HousekeepingTaskCreated` event

Confirmed checkout writes through ports in this order:

1. save the room transition
2. save the housekeeping task
3. append the audit entry
4. append both domain events
5. save the idempotency result

The audit entry and events carry `actor`, `correlationId`, and `idempotencyKey` metadata. `buildCheckInProjection` and `buildCheckOutProjection` expose stable PMS-owned projection objects for downstream room-ledger, housekeeping-task, and operation-log integration.

## Idempotency behavior

When `meta.mode === 'confirm'`, the idempotency repository is checked before room validation and before side effects.

If a stored result exists for `meta.idempotencyKey`, `checkOut` returns that result and does not create another task, audit entry, event, or room mutation.

Current bootstrap semantics assume each idempotency key maps to one logical checkout command result. A future persistent implementation should add request-fingerprint protection before accepting reused keys across different command payloads.

## Stable errors

Current stable error codes include:

- `MISSING_COMMAND_META`
- `MISSING_REASON`
- `MISSING_IDEMPOTENCY_KEY`
- `MISSING_CORRELATION_ID`
- `MISSING_ACTOR`
- `INVALID_REQUESTED_AT`
- `INVALID_EXECUTION_MODE`
- `ROOM_NOT_FOUND`
- `ROOM_NOT_CHECKOUTABLE`
- `ROOM_NOT_CHECKIN_ELIGIBLE`

## Verification

From repo root:

```bash
npm run verify
```

The command builds the workspace and runs the Vitest suite covering dry-run, confirm, read models, command projections, idempotency, audit/event metadata, invalid metadata, invalid room state, and replaceable ports.

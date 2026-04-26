# @pms-platform/core

`@pms-platform/core` owns deterministic PMS business behavior. The current proved command is `CHECK_OUT`.

## Public command surface

```ts
checkOut(command: CheckOutCommand, ports: CorePorts): CheckOutResult
```

Inputs are contract-owned types from `@pms-platform/contracts`:

- `CheckOutCommand`
- `CommandMeta`
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
| `reason` | Human-readable business reason for the checkout command. |
| `idempotencyKey` | Stable key for preventing duplicate confirmed execution. |
| `correlationId` | Trace key shared by result, audit, and events. |
| `requestedAt` | ISO-8601 request timestamp. |
| `mode` | `dryRun` or `confirm`. |

Metadata validation returns stable `DomainError` values before room mutation.

## State transition matrix

`CHECK_OUT` is allowed only for checkoutable occupancy states.

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

## Dry-run result

For `meta.mode === 'dryRun'`, success returns:

- `mode: 'dryRun'`
- current room status
- next room status
- housekeeping task preview
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

The audit entry and both events carry `actor`, `correlationId`, and `idempotencyKey` metadata.

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

## Verification

From repo root:

```bash
npm run verify
```

The command builds the workspace and runs the Vitest suite covering dry-run, confirm, idempotency, audit/event metadata, invalid metadata, invalid room state, and replaceable ports.

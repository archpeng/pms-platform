# PMS Checkout Local Sandbox Runtime v1

## Purpose

This document records the PMS-owned local checkout sandbox boundary. The boundary exposes `pms_check_out(mode=dryRun|confirm)` over a local HTTP server while keeping PMS Core as the canonical owner of checkout state, idempotency, request-fingerprint compatibility, rooms, housekeeping tasks, audits, and domain events.

This is a PMS transport/state surface only. It does not implement Feishu cards, Hermes conversation logic, adapter callbacks, or any credential storage.

## Runtime entrypoint

```bash
npm run start:local-api
```

Default local URL:

```text
http://127.0.0.1:8791
```

The script builds TypeScript first and runs the compiled local server. It prints only endpoint/auth/env-name metadata and never prints token values.

## Environment names

| Env name | Meaning | Value policy |
|---|---|---|
| `PMS_PLATFORM_LOCAL_AUTH_TOKEN` | Bearer token expected by mutating/readback sandbox calls | Required for protected calls when auth is enabled; value must stay in local env only |
| `PMS_PLATFORM_LOCAL_AUTH_REQUIRED` | Set to `false` only for isolated local development without auth | Do not use to expose remote access |
| `PMS_PLATFORM_SQLITE_DB_PATH` | SQLite database path for restart-safe sandbox state | Local path only; default is `.local/pms.sqlite` |
| `PMS_PLATFORM_LOCAL_PORT` | Local server port | Defaults to `8791` |
| `PMS_PLATFORM_SANDBOX_RESET_ON_START` | Set to `true` to reset to seed room on process start | Safe sandbox reset control |
| `PMS_PLATFORM_SANDBOX_SEED_ROOM_ID` | Optional seed room id | Fake/sandbox values only |
| `PMS_PLATFORM_SANDBOX_SEED_ROOM_NUMBER` | Optional seed room number | Fake/sandbox values only |

Do not commit token values or real sensitive identifiers.

## HTTP endpoints

### `GET /health`

Unauthenticated health/readiness metadata.

Expected shape:

```json
{
  "ok": true,
  "service": "pms-platform",
  "boundary": "pms-checkout-local-sandbox",
  "operation": "pms_check_out",
  "storage": {
    "kind": "sqlite",
    "envName": "PMS_PLATFORM_SQLITE_DB_PATH",
    "driver": "node:sqlite",
    "experimental": true
  },
  "auth": {
    "type": "bearer-token",
    "envName": "PMS_PLATFORM_LOCAL_AUTH_TOKEN",
    "configured": true,
    "required": true
  }
}
```

### `POST /v1/pms/check-out`

Protected local API endpoint for PMS checkout.

Request body is the existing `CheckOutApiRequest` shape from `@pms-platform/api`:

```json
{
  "operation": "pms_check_out",
  "mode": "dryRun",
  "roomId": "room-1001",
  "actor": { "type": "human", "id": "frontdesk-1" },
  "source": "api",
  "reason": "Guest departed and returned room cards.",
  "idempotencyKey": "live-sandbox-dry-run-room-1001",
  "correlationId": "corr-live-sandbox-room-1001",
  "requestedAt": "2026-04-26T00:00:00.000Z",
  "requestFingerprint": "sha256:live-sandbox-dry-run-room-1001"
}
```

`mode` is authoritative. Prompt-like text inside `reason` cannot turn `dryRun` into `confirm`.

### `GET /v1/sandbox/readback` and `GET /v1/sandbox/readback/<roomId>`

Protected readback endpoint for live proof. It returns:

- rooms;
- housekeeping tasks;
- audit entries;
- domain events;
- idempotency/fingerprint records.

This is the S6 evidence surface for before/after proof.

### `POST /v1/sandbox/reset`

Protected sandbox reset endpoint. Optional body:

```json
{
  "rooms": [
    {
      "roomId": "room-1001",
      "roomNumber": "1001",
      "occupancyStatus": "dueOut",
      "cleaningStatus": "clean",
      "saleStatus": "sellable"
    }
  ]
}
```

Reset clears tasks, audits, events, and idempotency records. It is for local sandbox setup only.

## Durable state contract

The SQLite store persists:

1. `rooms`
2. `housekeepingTasks`
3. `audits`
4. `domainEvents`
5. PMS Core confirm idempotency results
6. API request idempotency/fingerprint records

Durability is scoped to checkout sandbox state. The prior JSON file store and storage selector have been removed so local sandbox code has one canonical persistence path. This intentionally does not introduce a wider production database schema or cross-domain PMS persistence decision.

## Validation

```bash
npm run verify
npm run test -- packages/api/test/local-sandbox-http.test.ts
```

The local sandbox test proves:

1. `/health` names the PMS boundary, SQLite state, and auth env names.
2. Protected checkout/readback/reset calls require bearer auth.
3. Dry-run is non-mutating for room/task/audit/event state even when reason text asks to confirm.
4. Confirm writes room/task/audit/event state through PMS Core/API.
5. State and idempotency/fingerprint records survive process restart by reopening the same SQLite database.
6. Duplicate confirm is idempotent, while reused idempotency key with incompatible fingerprint returns `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT`.
7. Reset safely reseeds the sandbox and clears derived state.

## Boundary proof

- PMS Core/contracts stay free of Feishu, Hermes, and adapter imports.
- The HTTP server calls `executeCheckOutApiRequest`, which calls PMS Core through the existing API/Core boundary.
- Feishu card rendering and callback forwarding belong to `adapter-feishu`; conversation routing belongs to `ai-conversation`.

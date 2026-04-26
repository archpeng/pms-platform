# Request Fingerprint / Idempotency v1

This note records the S1 API/MCP boundary design for `pms_check_out`. It does not change PMS Core checkout semantics and does not introduce durable persistence.

## Scope

Applies to the transport-neutral API/MCP request contract for PMS `CHECK_OUT` dry-run and confirm requests.

Out of scope for S1:

- HTTP server runtime.
- MCP server runtime or transport selection.
- Database schema, Postgres persistence, or durable outbox.
- Feishu callback/card confirmation state.
- Hermes tool registration.

## Canonical request identity

Each API/MCP request carries both:

1. `idempotencyKey` — caller-provided key copied into the PMS Core command metadata.
2. `requestFingerprint` — boundary-level digest of the canonical request payload.

The canonical fingerprint input is represented by `RequestFingerprintInput` in `@pms-platform/api` and includes:

- `operation`: currently `pms_check_out`.
- `mode`: `dryRun` or `confirm`.
- `roomId`.
- `actor`.
- `source`.
- `reason`.
- `correlationId`.
- `requestedAt`.

The fingerprint intentionally excludes `idempotencyKey`; the key indexes a request, while the fingerprint detects whether a reused key is still attached to the same canonical payload.

## Intended duplicate-key behavior

Future API persistence should treat `(operation, idempotencyKey)` as the lookup key.

- Same key + same fingerprint: return or reuse the prior boundary result according to the mode-specific handler policy.
- Same key + different fingerprint: reject as an incompatible idempotency reuse before calling PMS Core. The local API slice uses `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_FINGERPRINT` for this boundary error.
- New key: call the PMS-owned API/Core path and persist enough result metadata for later retries.

PMS Core already stores confirmed command results by `idempotencyKey`. This boundary design adds the missing payload-compatibility guard before distributed API/MCP exposure.

## Dry-run versus confirm

Dry-run requests are non-mutating at PMS Core, but they still carry idempotency and fingerprint metadata so a future confirmation loop can correlate a human-visible preview with a later confirm request.

Confirm requests are mutating and must carry explicit `mode: 'confirm'`. MCP tooling must not infer confirm from prose or omit the mode field.

## Residuals for future slices

S1 documents the contract only. Later slices must decide and test:

1. Whether dry-run results are cached or recomputed for identical fingerprints beyond the current in-memory test guard.
2. The durable storage shape for request fingerprints and serialized results.
3. Expiration/retention policy for idempotency records.

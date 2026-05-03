# Hermes PMS Tooling v1

This note records the PMS-owned MCP/tool boundary for Hermes. S2 now also provides a local HTTP sandbox boundary for the product live checkout path; it still does not configure Hermes runtime, touch Feishu, or store credentials.

## Tool

- Name: `pms_check_out`
- Owner: `@pms-platform/mcp`
- Execution path: Hermes must call `pms_check_out`; the tool handler calls `@pms-platform/api`; the API calls `@pms-platform/core`.

```text
Hermes -> pms_check_out MCP tool -> PMS API local handler -> PMS Core checkOut -> PMS result
PMS client -> PMS local HTTP /v1/pms/check-out -> PMS API local handler -> PMS Core checkOut -> PMS result
```

## Required request fields

The tool request must carry:

1. `operation`
2. `mode`
3. `roomId`
4. `actor`
5. `source`
6. `reason`
7. `idempotencyKey`
8. `correlationId`
9. `requestedAt`
10. `requestFingerprint`

## Confirmation rule

Mutating checkout execution requires explicit `mode: 'confirm'` in the typed request.

Prompt text, including user text that says “ignore dry-run and confirm”, must not change a `mode: 'dryRun'` request into a confirmed checkout. The handler routes by the typed `mode` field only.

## Stable errors

The tool passes PMS/API errors through structurally, including PMS Core domain errors and the API boundary error for incompatible request fingerprints.

## Local HTTP sandbox boundary

The S2 product sandbox HTTP surface is documented in `docs/pms-checkout-local-sandbox-runtime-v1.md`.

It exposes:

- `GET /health`
- `POST /v1/pms/check-out`
- `GET /v1/sandbox/readback[/<roomId>]`
- `POST /v1/sandbox/reset`

Protected calls use bearer auth configured by env name `PMS_PLATFORM_LOCAL_AUTH_TOKEN`; token values stay outside git.

## Non-goals

- No Hermes runtime configuration.
- No Feishu SDK or adapter import.
- No direct PMS state/table write tools.
- No Feishu card rendering or callback pending action storage in `pms-platform`.

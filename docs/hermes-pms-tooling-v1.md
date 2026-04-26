# Hermes PMS Tooling v1

This note records the PMS-owned MCP tool boundary for Hermes. It is documentation only; S3 does not configure Hermes, start an MCP transport, or touch Feishu.

## Tool

- Name: `pms_check_out`
- Owner: `@pms-platform/mcp`
- Execution path: Hermes must call `pms_check_out`; the tool handler calls `@pms-platform/api`; the API calls `@pms-platform/core`.

```text
Hermes -> pms_check_out MCP tool -> PMS API local handler -> PMS Core checkOut -> PMS result
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

## Non-goals for S3

- No Hermes runtime configuration.
- No MCP server transport decision.
- No Feishu SDK or adapter import.
- No direct PMS state/table write tools.

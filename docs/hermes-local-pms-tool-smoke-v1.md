# Hermes Local PMS Tool Smoke v1

This is the S4 local smoke proof for the PMS `pms_check_out` tool path. It is intentionally local and does not configure Hermes runtime, Feishu messaging, credentials, or any MCP transport.

## Smoke path

```text
Hermes local operator intent
  -> typed pms_check_out tool request
  -> @pms-platform/mcp executePmsCheckOutTool
  -> @pms-platform/api executeCheckOutApiRequest
  -> @pms-platform/core checkOut
  -> structured PMS dry-run / confirm response
```

## Reproducible probe

```bash
npm run test -- packages/mcp/test/hermes-local-smoke.test.ts
```

This probe creates in-memory PMS Core ports and sends typed requests shaped like Hermes tool calls.

## Dry-run transcript

Input highlights:

```text
operation: pms_check_out
mode: dryRun
source: mcp
actor.type: ai
actor.id: hermes-local-smoke
roomId: room-hermes-1001
```

Expected output highlights:

```text
ok: true
mode: dryRun
plan.currentStatus.occupancy: dueOut
plan.nextStatus.occupancy: vacant
plan.nextStatus.cleaning: dirty
```

Expected guard:

```text
room remains dueOut
no housekeeping task is created
```

## Confirm transcript

Input highlights:

```text
operation: pms_check_out
mode: confirm
source: mcp
actor.type: ai
reason: Human confirmed checkout after reviewing the dry-run card preview.
correlationId: corr-hermes-local-checkout-1001
```

Expected output highlights:

```text
ok: true
mode: confirm
result.commandType: CHECK_OUT
result.roomId: room-hermes-1001
```

Expected side effects through PMS Core only:

```text
room occupancy becomes vacant
audit actor is hermes-local-smoke
audit source is mcp
correlationId is preserved
```

## Guard note

Hermes remains an operator over PMS tools. It must not directly mutate PMS Core repositories, Feishu Base, or adapter internals. Confirm execution is controlled by typed `mode: 'confirm'` plus explicit actor/reason/idempotency/correlation metadata, not by free-form prompt text.

## Non-goals

- No Feishu messaging enablement.
- No real secrets.
- No MCP server transport decision.
- No global Hermes runtime configuration.

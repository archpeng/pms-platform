# pms-platform agent policy

## Service role

`pms-platform` owns PMS domain truth for the Feishu/PMS product path. It owns PMS domain truth, persistence, state transitions, read models, audits, idempotency, and business invariants.

Active product chain:

```text
Feishu
  -> adapter-feishu
  -> pms-agent-v2
  -> pms-platform
```

Ownership split:

- `adapter-feishu`: Feishu transport, message/card delivery, typed-card callback transport, allowlists, dedupe, and managed Base adapter seams.
- `pms-agent-v2`: Pi/LLM conversation continuity, LLM semantic routing, safe tool planning, deterministic policy/PlanCompiler gate use, and grounded user replies.
- `pms-platform`: PMS domain truth, command semantics, typed workflow/capability execution, persistence, state transitions, read models, audits, idempotency, and business invariants.

## Boundary law

`pms-platform` must remain the PMS truth/read-model owner:

- PMS state changes must be typed commands or typed domain functions, not customer-chat tools;
- PMS reads must be typed read models, not generic SQL/projection/customer-chat surfaces;
- operation-request read/list APIs must be typed PMS read models, not generic customer-chat projection surfaces;
- future operation-request state transitions must preserve PMS-owned audits, idempotency, and business invariants;
- service/API/MCP layers must call PMS core behavior rather than reimplementing business rules.

`pms-platform` must not become a conversation, workflow, or transport owner:

- does not own Pi/LLM runtime or semantic routing;
- does not own Feishu conversation routing;
- does not own Feishu transport, cards, callbacks, allowlists, or dedupe;
- owns typed PMS workflow, pending-action, callback-result, event/readback/outbox, and projection-truth semantics;
- does not expose arbitrary HTTP, shell, file, SQL, Base/Bitable, or generic customer-chat tools.

## Dependency boundary

Do not add `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, or Feishu SDK packages such as `@larksuiteoapi/node-sdk` to this repo. Pi/LLM conversation runtime belongs in `pms-agent-v2`; Feishu runtime belongs in `adapter-feishu`; active PMS workflow/truth APIs belong in `pms-platform`.

## Validation

`npm run verify` is the repo-local verification ladder. It must run `scripts/check-boundaries.mjs` before build/test so accidental Pi/LLM/Feishu adapter runtime drift fails before PMS business verification proceeds.

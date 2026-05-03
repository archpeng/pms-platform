# pms-platform agent policy

## Service role

`pms-platform` owns PMS domain truth for the Feishu/PMS product path. It owns PMS domain truth, persistence, state transitions, read models, audits, idempotency, and business invariants.

Active cutover product chain:

```text
Feishu
  -> adapter-feishu
  -> ai-conversation
  -> pms-platform
```

Explicit legacy rollback chain:

```text
Feishu
  -> adapter-feishu
  -> ai-conversation
  -> ai-pms
  -> pms-platform
```

Ownership split:

- `adapter-feishu`: Feishu transport, message/card delivery, typed-card callback transport, allowlists, dedupe, and managed Base adapter seams.
- `ai-conversation`: Pi/LLM conversation continuity, LLM semantic routing, safe tool planning, deterministic policy/PlanCompiler gate use, and grounded user replies.
- `ai-pms`: explicit legacy rollback and non-customer migration evidence for PMS workflow orchestration compatibility, dry-run/confirm identity law, pending/callback/outbox compatibility, projection coordination history, and typed endpoint contracts until deprecation is accepted.
- `pms-platform`: PMS domain truth, command semantics, persistence, state transitions, read models, audits, idempotency, and business invariants.

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
- does not own legacy `ai-pms` rollback runtime operation, but does own the successor typed PMS workflow, pending-action, callback-result, event/readback/outbox, and projection-truth semantics after cutover;
- does not expose arbitrary HTTP, shell, file, SQL, Base/Bitable, or generic customer-chat tools.

## Dependency boundary

Do not add `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, or Feishu SDK packages such as `@larksuiteoapi/node-sdk` to this repo. Pi/LLM conversation runtime belongs in `ai-conversation`; Feishu runtime belongs in `adapter-feishu`; active PMS workflow/truth APIs belong in `pms-platform`; `ai-pms` remains legacy rollback/non-customer migration evidence until deprecation is accepted.

## Validation

`npm run verify` is the repo-local verification ladder. It must run `scripts/check-boundaries.mjs` before build/test so accidental Pi/LLM/Feishu adapter runtime drift fails before PMS business verification proceeds.

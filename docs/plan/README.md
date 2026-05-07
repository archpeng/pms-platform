# PMS Platform Plan Control Plane

## Status

- Active parser pack: `none`
- Current active slice: `none`
- Current active state: `none`
- Current master wave: `none`
- Next runnable phase: `none`
- Latest closed pack: `pms-platform-agent-typed-capabilities-v1-2026-05-07`
- Cold archive root: `docs/plan-archive/`

## Active Pack Files

None.

## Current Truth

The active cross-repo product direction is:

```text
adapter-feishu -> pms-agent-v2 -> pms-platform
```

`pms-platform` owns PMS domain truth, typed PMS capability contracts, read models, draft/prepare-confirm workflows, pending-action semantics, audits, idempotency, and local sandbox HTTP truth. It must not own Pi/LLM runtime, Feishu transport, conversation routing, or generic customer-chat tooling.

## Parser Scope Contract

`docs/plan/` is the hot autopilot scheduling surface. Keep it small: this README plus at most one active PLAN/STATUS/WORKSET triplet. Historical packs remain historical and must not be treated as active backlog.

Read archived pack files under `docs/plan-archive/` only when the user asks for history/evidence or when a new plan explicitly cites them.

## Latest Closeout

`pms-platform-agent-typed-capabilities-v1-2026-05-07` is closed and archived under:

```text
docs/plan-archive/pms-platform-agent-typed-capabilities-v1-2026-05-07/
```

Final platform-side evidence proved the typed PMS capability contract for successor `pms-agent-v2` wiring without adding Pi/LLM runtime, Feishu transport/runtime, generic customer-chat tooling, or final natural-language mutation in this repo.

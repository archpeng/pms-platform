# PMS Platform Plan Control Plane

## Active Pack

- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_PLAN.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_STATUS.md`
- `docs/plan/pms-platform-agent-typed-capabilities-v1-2026-05-07_WORKSET.md`

## Current Active Slice

- `P4`
## Intended Handoff

- `execution-reality-audit`
## Status

- Active parser pack: `pms-platform-agent-typed-capabilities-v1-2026-05-07`
- Current active slice: `P4`
- Current active state: `READY`
- Current master wave: `W5` final-audit-and-handoff
- Next runnable phase: `execution-reality-audit`
- Latest completed slice: `P3`
- Latest closed pack: `pms-r3-api-mcp-hermes-feishu-v1` archived as superseded historical evidence
- Cold archive root: `docs/plan-archive/`

## Current Truth

The active cross-repo product direction is:

```text
adapter-feishu -> pms-agent-v2 -> pms-platform
```

`pms-platform` owns PMS domain truth, typed PMS capability contracts, read models, draft/prepare-confirm workflows, pending-action semantics, audits, idempotency, and local sandbox HTTP truth. It must not own Pi/LLM runtime, Feishu transport, conversation routing, or generic customer-chat tooling.

## Parser Scope Contract

`docs/plan/` is the hot autopilot scheduling surface. Keep it small: this README plus one active PLAN/STATUS/WORKSET triplet. Historical packs remain historical and must not be treated as active backlog.

Read archived pack files under `docs/plan-archive/` only when the user asks for history/evidence or when a new plan explicitly cites them.

## Autopilot Transition Contract

- If active slice owner/state is `execute-plan` / `READY`, dispatch `execute` for the current active slice.
- `execute/completed` means implementation evidence is ready for same-slice `review`; it does not advance the active slice by itself.
- `review/completed` is the accepted-slice writeback point: mark the reviewed slice done, set the next Stage Order item as `Current Active Slice`, and set `Intended Handoff` from that next stage owner.
- `review/continue` keeps the same active slice and dispatches another bounded `execute` cycle.
- `needs_replan` dispatches `replan`; `blocked`/`failed` stop.
- `done` is reserved for full objective completion or `PACK_COMPLETE` closeout.
- `PACK_COMPLETE` with `Intended Handoff` `autopilot-closeout` is the only terminal parser state.
- Closeout is forbidden while `Current Active Slice` is any non-`PACK_COMPLETE` stage.

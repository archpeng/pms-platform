# Repo Plan Control Plane

## Active Pack

- none

## Current Active Slice

- none

## Intended Handoff

- `plan-creator`

## Live control-plane state

- active_step: `none`
- status: `no_active_pack`
- active_pack: `none`
- latest_platform_cutover: `2026-05-03 platform-only PMS/Feishu path`

## Current truth

The active customer-facing PMS/Feishu path is:

```text
adapter-feishu -> ai-conversation -> pms-platform
```

`pms-platform` owns PMS domain truth, read models, typed workflow APIs, pending-action callbacks, audits, idempotency, and projection-truth semantics. Hermes-era and pre-cutover execution packs are historical only and are not active backlog.

## Notes

- keep `docs/plan/README.md` as the small live control-plane entry
- there is currently no active parser-compatible pack in `docs/plan/*`
- PMS-owned implementation files live under this repo; keep `adapter-feishu/src/**` free of PMS domain logic

# PMS Platform Plan Control Plane

## Active Pack

- none

## Current Active Slice

- none

## Intended Handoff

- `plan-creator` for any future pack

## Live control-plane state

- active_step: `none`
- status: `no_active_pack`
- active_pack: `none`
- latest_superseded_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- latest_closeout: `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_CLOSEOUT.md`
- latest_upstream_closed_pack: `adapter-feishu/docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_CLOSEOUT.md`
- latest_completed_step: `S4`
- superseded_step: `S5`

## Latest supersession summary

`pms-r3-api-mcp-hermes-feishu-v1` is superseded as an active lane. S0-S4 remain valid historical PMS API/MCP/Hermes-shaped local smoke evidence, but S5-S9 are not active backlog because the current customer-facing PMS/Feishu path is `adapter-feishu -> ai-conversation -> ai-pms -> pms-platform`, not Hermes as hot-path conversation owner.

## Notes

- `docs/plan/*` remains the single-root machine-compatible control plane for this repo.
- There is currently no active parser-compatible pack in `docs/plan/*`.
- The adapter-hosted `ai-pms-core-bootstrap-v1` pack is closed and archived under `adapter-feishu/docs/archive/plan/`.
- Keep PMS business truth in `packages/core`; API/MCP/service layers must call the core rather than reimplementing checkout rules.
- Current customer-facing PMS/Feishu hot path is owned by `adapter-feishu`, `ai-conversation`, `ai-pms`, and `pms-platform`; Hermes is historical/internal-operator only unless a future explicit architecture decision reopens it.
- Broader production residuals remain successor work under the `ai-pms` production-readiness control plane, not this superseded Hermes lane.

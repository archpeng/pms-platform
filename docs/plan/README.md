# PMS Platform Plan Control Plane

## Active Pack

- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_PLAN.md`
- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_STATUS.md`
- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_WORKSET.md`

## Current Active Slice

- `S1`

## Intended Handoff

- `execute-plan`

## Live control-plane state

- active_step: `S1`
- status: `ready_for_execution`
- active_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- latest_upstream_closed_pack: `adapter-feishu/docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_CLOSEOUT.md`
- latest_completed_step: `S0`

## Active slice summary

`S1` creates the PMS-owned API/MCP package skeleton and tool contracts for exposing the proven `CHECK_OUT` core behavior without duplicating PMS Core rules or touching Feishu/Hermes runtime configuration.

## Notes

- `docs/plan/*` is the single-root machine-compatible control plane for the current PMS-owned execution pack.
- The adapter-hosted `ai-pms-core-bootstrap-v1` pack is closed and archived under `adapter-feishu/docs/archive/plan/`.
- Keep PMS business truth in `packages/core`; API/MCP/Hermes/Feishu layers must call the core rather than reimplementing checkout rules.
- `adapter-feishu` remains the Feishu channel adapter; Hermes remains AI operator/runtime; Feishu remains the human UI/collaboration surface.

# PMS Platform Plan Control Plane

## Active Pack

- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_PLAN.md`
- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_STATUS.md`
- `docs/plan/pms-r3-api-mcp-hermes-feishu-v1_WORKSET.md`

## Current Active Slice

- `S5`

## Intended Handoff

- `human decision`

## Live control-plane state

- active_step: `S5`
- status: `blocked_operator_allowlist`
- active_pack: `pms-r3-api-mcp-hermes-feishu-v1`
- latest_upstream_closed_pack: `adapter-feishu/docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_CLOSEOUT.md`
- latest_completed_step: `S4`

## Active slice summary

`S5` progressed: local adapter Feishu credentials and sandbox chat id are configured outside git, adapter Feishu smoke delivered, and Hermes gateway connected to Feishu/Lark. Remaining blocker is a safe operator allowlist / inbound proof; do not enable broad remote access with `GATEWAY_ALLOW_ALL_USERS=true`.

## Notes

- `docs/plan/*` is the single-root machine-compatible control plane for the current PMS-owned execution pack.
- The adapter-hosted `ai-pms-core-bootstrap-v1` pack is closed and archived under `adapter-feishu/docs/archive/plan/`.
- Keep PMS business truth in `packages/core`; API/MCP/Hermes/Feishu layers must call the core rather than reimplementing checkout rules.
- `adapter-feishu` remains the Feishu channel adapter; Hermes remains AI operator/runtime; Feishu remains the human UI/collaboration surface.

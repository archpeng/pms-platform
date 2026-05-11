# PMS Platform Local HTTP / Fixture Debt Plan

Plan ID: `pms-platform-local-http-fixture-debt-d0-d2-v1-2026-05-11`
State: `PACK_COMPLETE`

## Goal

Close the two external residuals recorded by `pms-agent-v2` static debt:

1. Split the local sandbox HTTP catch-all handler into route-owner modules without changing behavior.
2. Consolidate the sample small-hotel room-number to room-type mapping into one fixture owner reused by local sandbox seed and provisioning profile code.

## Stages

- `D0` fixture-owner-consolidation
- `D1` local-http-route-owner-extraction
- `D2` cross-repo-verification-and-debt-closeout

## Non-Goals

- No route semantics changes.
- No PMS business invariant changes.
- No Pi/LLM, Feishu, adapter, or customer-chat ownership added to `pms-platform`.

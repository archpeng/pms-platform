# PMS Platform Local HTTP / Fixture Debt Closeout

Plan ID: `pms-platform-local-http-fixture-debt-d0-d2-v1-2026-05-11`
Closeout state: `PACK_COMPLETE`
Closed on: 2026-05-11

## Summary

Closed the two external `pms-platform` residuals recorded by `pms-agent-v2` static debt.

## Closed Scope

- `DEBT-AI-003`: local sandbox HTTP handler breadth.
  - `httpHandler.ts` now owns only auth, error handling, route context, route ordering, and 404 fallback.
  - Route behavior moved into owner modules:
    - `httpHealthRoutes.ts`
    - `httpCommandRoutes.ts`
    - `httpReadRoutes.ts`
    - `httpWorkflowRoutes.ts`
    - `httpOperationRequestRoutes.ts`
    - `httpPendingActionRoutes.ts`
    - `httpSandboxRoutes.ts`
- `DEBT-AI-007`: duplicated sample hotel room-type mapping.
  - `packages/contracts/src/fixtures.ts` now owns the small-hotel room numbers, room-number to room-type mapping, and room-type id mapping.
  - Local sandbox seed and provisioning profile reuse that fixture owner.
- Boundary policy and line-budget checks now protect the new ownership split.

## Evidence

- `packages/api/src/localSandbox/httpHandler.ts`: reduced from 463 lines to 62 lines.
- `packages/api/src/localServerMain.ts`: no local room-number mapping function remains.
- `packages/provisioning/src/profile.ts`: no local room-number mapping function remains.
- Static search leaves the A/B/C/D/E room mapping only in `packages/contracts/src/fixtures.ts`.

## Verification

- `npm run verify`: passed.
  - `scripts/check-boundaries.mjs`: passed.
  - `tsc -p tsconfig.json`: passed.
  - Vitest: 28 files passed, 108 tests passed.
- Cross-repo `pms-agent-v2 pnpm build`: passed.
- Cross-repo `pms-agent-v2 pnpm test`: passed with 28 Vitest files passed / 1 skipped, 190 tests passed / 2 skipped, boundary guard passed, eval ok=true 21/21 with 22 audit events.

## Residuals

No same-pack `pms-platform` residual remains open. This closeout did not add Pi/LLM runtime, Feishu transport, generic customer-chat behavior, or PMS business semantic changes.

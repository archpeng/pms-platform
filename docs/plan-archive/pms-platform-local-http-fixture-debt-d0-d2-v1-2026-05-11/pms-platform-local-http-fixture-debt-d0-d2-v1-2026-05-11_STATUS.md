# PMS Platform Local HTTP / Fixture Debt Status

Plan ID: `pms-platform-local-http-fixture-debt-d0-d2-v1-2026-05-11`
Status file state: `PACK_COMPLETE`

## Completed Stages

- [x] `D0` fixture-owner-consolidation
- [x] `D1` local-http-route-owner-extraction
- [x] `D2` cross-repo-verification-and-debt-closeout

## Result

- `packages/contracts/src/fixtures.ts` owns the shared sample small-hotel property id, room numbers, room-number to room-type mapping, and room-type id mapping.
- `packages/api/src/localServerMain.ts` and `packages/provisioning/src/profile.ts` now reuse the shared fixture owner.
- `packages/api/src/localSandbox/httpHandler.ts` is reduced to auth/error orchestration and route ordering.
- Local sandbox HTTP route families now live in focused owner modules for health/manifest, command, read, workflow, operation request, pending action, and sandbox administration.
- Boundary documentation and line-budget checks now lock these owner boundaries.

## Verification

- `npm run verify`: passed.
  - boundary check: passed.
  - build: passed.
  - Vitest: 28 files passed, 108 tests passed.
- Cross-repo `pms-agent-v2 pnpm build`: passed.
- Cross-repo `pms-agent-v2 pnpm test`: passed with 28 Vitest files passed / 1 skipped, 190 tests passed / 2 skipped, boundary guard passed, eval ok=true 21/21 with 22 audit events.

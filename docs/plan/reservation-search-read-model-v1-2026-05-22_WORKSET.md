# Reservation Search Read Model V1 Workset

## Allowed Files

- `packages/contracts/src/readModels.ts`
- `packages/contracts/src/index.ts`
- `packages/api/src/operations.ts`
- `packages/api/src/readModelApi.ts`
- `packages/api/src/capabilityManifest.ts`
- `packages/api/src/localSandbox/httpReadRoutes.ts`
- `packages/api/src/sqliteSandbox/reservationReadStore.ts`
- `packages/api/src/localServerMain.ts`
- Focused tests under `packages/**/src/**/*.test.ts` or existing test owners.
- `docs/plan/reservation-search-read-model-v1-2026-05-22_*`
- `docs/plan/README.md`

## Stop Boundaries

- Stop before touching reservation mutation/workflow semantics.
- Stop before adding generic query language, SQL, customer-chat, Pi, LLM, Feishu, or adapter behavior.
- Stop if a downstream agent requirement needs PMS mutation or a broader projection contract.

## Verification Commands

```bash
npm run verify
```

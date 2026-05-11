# PMS Platform Local HTTP / Fixture Debt Workset

Plan ID: `pms-platform-local-http-fixture-debt-d0-d2-v1-2026-05-11`
State: `PACK_COMPLETE`

## D0 Fixture Owner

Write set:

- `packages/contracts/src/fixtures.ts`
- `packages/api/src/localServerMain.ts`
- `packages/provisioning/src/profile.ts`
- `packages/provisioning/package.json`
- `package-lock.json`

Done when:

- There is one sample small-hotel room-number to room-type mapping owner.
- Local sandbox seed and provisioning profile both import from that owner.

## D1 Local HTTP Route Owners

Write set:

- `packages/api/src/localSandbox/httpHandler.ts`
- `packages/api/src/localSandbox/httpHealthRoutes.ts`
- `packages/api/src/localSandbox/httpCommandRoutes.ts`
- `packages/api/src/localSandbox/httpReadRoutes.ts`
- `packages/api/src/localSandbox/httpWorkflowRoutes.ts`
- `packages/api/src/localSandbox/httpOperationRequestRoutes.ts`
- `packages/api/src/localSandbox/httpPendingActionRoutes.ts`
- `packages/api/src/localSandbox/httpSandboxRoutes.ts`
- `packages/api/src/localSandbox/httpRouteTypes.ts`
- `packages/api/src/localSandbox/httpTransactions.ts`

Done when:

- `httpHandler.ts` only owns auth, error handling, and route ordering.
- Existing HTTP tests prove route behavior stayed compatible.

## D2 Boundary And Closeout

Write set:

- `AGENTS.md`
- `scripts/check-boundaries.mjs`
- `docs/plan/README.md`
- `docs/plan-archive/README.md`
- `docs/plan-archive/pms-platform-local-http-fixture-debt-d0-d2-v1-2026-05-11/*`
- `/home/peng/dt-git/github/pms-agent-v2/docs/debt/static-code-audit-debt-2026-05-10.md`

Done when:

- Repo-local `npm run verify` passes.
- Cross-repo `pms-agent-v2 pnpm test` passes.
- The originating `pms-agent-v2` debt register no longer marks DEBT-AI-003 or DEBT-AI-007 open.

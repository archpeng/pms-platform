# Reservation Search Read Model V1 Plan

## Goal

Add a PMS-owned typed reservation search read model so downstream agents can search reservations by guest display name using current `pms-platform` evidence.

## Owner Boundary

- Owner: `pms-platform` read-model API and SQLite sandbox read store.
- Downstream consumer: `pms-agent-v2` via typed HTTP client only.
- Not owned here: Pi/LLM routing, chat wording, Feishu transport, generic SQL/search endpoints.

## Red Lines

- Do not expose arbitrary SQL or generic customer-chat search.
- Do not change reservation mutation, workflow, pending-action, audit, or idempotency semantics.
- No Pi/LLM/Feishu runtime dependencies.

## Stages

1. Contract and operation: define `pms_reservation_search` and `ReservationSearchReadModel`.
2. Store and HTTP route: add guest-name search with validation, stable sorting, and empty-list success.
3. Manifest and preview seed: expose read capability and support JSON seed reservations for local sandbox preview.
4. Tests and gate: add store/HTTP/manifest/seed coverage and run `npm run verify`.

## Verification Gate

```bash
npm run verify
```

## Done When

- `/v1/pms/reservations/search` returns PMS evidence for guest-name queries.
- Search validates minimum term length and limit bounds.
- Local reset seed can inject a demo `李晶晶` reservation.
- `npm run verify` passes.

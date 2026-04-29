# PMS Base Provisioning v1

## Active SSOT

The active source of truth for the Feishu Base table definition and end-user Chinese display language is:

- `packages/provisioning/src/index.ts`
  - `HotelProfile`
  - `PmsBaseProvisioningSpec`
  - `createSmallHotelPmsBaseProvisioningSpec()`
  - `validatePmsBaseProvisioningSpec()`

This package is PMS-owned. `adapter-feishu` may consume generated registry bindings and execute Feishu/Lark operations, but it must not define the PMS table schema.

## Ownership boundary

| Owner | Owns | Does not own |
| --- | --- | --- |
| `pms-platform` | PMS semantic schema, Chinese table/view/form/field display names, field kinds, status options, seed-room profile, provisioning validation, adapter registry template | Real Feishu app/base/table/form IDs, Feishu SDK runtime, customer chat ingress |
| `adapter-feishu` | Feishu/Lark API seams, `ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH`, target shielding, schema-drift checks, bounded `pms_base_*` wrappers | PMS business schema, PMS state machine, canonical PMS storage |
| `ai-pms` | Product orchestration, typed-confirm policy, proof and redacted evidence | Base schema definition, raw Base targets |
| Feishu Base | Human-facing dashboard/collaboration projection | Canonical PMS database |

## Chinese table definition

`createSmallHotelPmsBaseProvisioningSpec()` currently defines these logical tables and Chinese display names:

| Logical table | Chinese display name | Purpose |
| --- | --- | --- |
| `RoomLedger` | `房态台账` | Room-state dashboard projection. |
| `OperationRequests` | `PMS操作请求` | PMS operation request projection/upsert surface. |
| `HousekeepingTasks` | `保洁任务` | Housekeeping task projection board. |
| `MaintenanceTickets` | `维修工单` | Maintenance/stop-sell projection board. |
| `Reservations` | `预订` | Arrival/departure read-model projection. |
| `OperationLogs` | `操作日志` | PMS operation/audit projection. |
| `InventoryCalendar` | `库存日历` | Sellability/inventory planning projection. |

The same spec owns Chinese field/display values such as `房号`, `房型`, `入住状态`, `清洁状态`, `可售状态`, `请求令牌`, `操作类型`, `操作状态`, `操作人`, `原因`, `请求时间`, `请求JSON`, `结果JSON`, and `版本`.

## Registry handoff

The provisioning spec includes `adapterRegistryBindings.pmsBaseProjection` as a template. A local provisioning/execution lane may resolve real Feishu targets and write ignored local registry files, for example:

```text
adapter-feishu/config/pms-base-projections.local.json
```

Those local registries contain deployment targets and business-field-to-Feishu-field mappings. They are generated artifacts/configuration, not the schema SSOT.

## Validation

Use PMS validation for schema truth:

```bash
cd /home/peng/dt-git/github/pms-platform
npm run verify
```

The provisioning tests assert the deterministic Chinese table names, field names, seed rooms, registry template, and no-Feishu-SDK boundary for PMS core/contracts.

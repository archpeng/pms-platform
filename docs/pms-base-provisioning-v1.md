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
| `pms-agent-v2` | Product conversation and safe tool routing | Base schema definition, raw Base targets |
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
| `Stays` | `入住记录` | PMS-owned stay lifecycle read-model projection. |
| `OperationLogs` | `操作日志` | PMS operation/audit projection. |
| `InventoryCalendar` | `库存日历` | Sellability/inventory planning projection. |
| `ProjectionStatus` | `投影状态` | Optional operator-visible projection freshness/failure read model. |

The same spec owns Chinese field/display values such as `后端ID`, `房号`, `房型`, `入住状态`, `入住时间`, `离店时间`, `清洁状态`, `可售状态`, `请求令牌`, `操作类型`, `操作状态`, `操作人`, `原因`, `请求时间`, `请求JSON`, `结果JSON`, `关联房间`, `关联操作请求`, `投影名称`, `聚合键`, `状态`, `尝试次数`, `最近投影时间`, `错误摘要`, `投影状态`, and `版本`.

`OperationRequests` includes PMS command actions plus reservation workflow projection actions `RESERVATION_WORKFLOW` and `RESERVATION_GROUP_WORKFLOW`. Its status options include `待处理`, `待确认`, `处理中`, `已完成`, `失败`, `需人工复核`, `已过期`, `已取消`, and `重复忽略`.

`projectionKind=reservationWorkflow` is projected by `pms-platform` through adapter operation `pms_base_upsert_operation_request` into `PMS操作请求`, not into `预订`. The `预订` table remains a PMS reservation read-model projection, while draft/group workflow events remain operator-visible operation workflow rows until a future confirmed reservation materialization contract exists.

## D4A relationship fields

D4A keeps Feishu Base as an operator projection/read model. The hidden and linked fields below improve navigation, but backend IDs/business keys in `pms-platform` remain canonical PMS truth.

Hidden canonical ID fields:

| Table | Hidden field | PMS value rule |
| --- | --- | --- |
| `房态台账` | `后端ID` | PMS room backend ID or stable room business key. |
| `PMS操作请求` | `后端ID` | PMS operation request ID; pre-D5 seed rows use request-token-derived stable keys. |
| `保洁任务` | `后端ID` | PMS housekeeping task ID. |
| `维修工单` | `后端ID` | PMS maintenance ticket ID. |
| `预订` | `后端ID` | PMS reservation ID or reservation business key. |
| `入住记录` | `后端ID` | PMS stay ID from backend stay lifecycle truth. |
| `操作日志` | `后端ID` | PMS audit/log ID. |
| `库存日历` | `后端ID` | PMS inventory interval projection ID. |
| `投影状态` | `后端ID` | Projection delivery/freshness business key owned by platform projection metadata. |

Symbolic linked-record fields:

| Table | Linked field | Symbolic target | Runtime role |
| --- | --- | --- | --- |
| `保洁任务` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional operator click-through. |
| `维修工单` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional operator click-through. |
| `预订` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional operator click-through. |
| `入住记录` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional stay-to-room navigation; PMS `房号` remains visible fallback. |
| `操作日志` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional operator click-through. |
| `操作日志` | `关联操作请求` | `OperationRequests` / `PMS操作请求` by `请求令牌` | Optional operator traceability. |
| `库存日历` | `关联房间` | `RoomLedger` / `房态台账` by `房号` | Optional calendar-to-room navigation. |

Tracked specs intentionally use symbolic logical table names instead of real Feishu table or record IDs. Local provisioning/runtime lanes may resolve those symbols to tenant-specific targets in ignored local config.

`Stays` / `入住记录` is now part of the projection schema after the PMS-owned stay lifecycle contract. Its row identity is hidden `后端ID`, while `预订号`, `房号`, `入住状态`, `入住时间`, and `离店时间` remain visible business fallback fields. `入住记录.关联房间` is symbolic-only and resolves to `RoomLedger` by `房号`; unresolved linked records must leave the visible `房号` fallback intact and surface retryable/stale projection evidence in the adapter/orchestrator layers.

## D6B projection status table

`ProjectionStatus` / `投影状态` is an optional operator-visible status projection. It is not a PMS command source and must not be read as canonical PMS business state.

| Field | Purpose |
| --- | --- |
| `后端ID` | Hidden projection status business key, e.g. projection family plus aggregate key. |
| `投影名称` | Display-safe projection family/table name. |
| `聚合键` | Display-safe PMS/business aggregate key such as room number, request token, or inventory interval key. |
| `状态` | Projection delivery/freshness status: `pending`, `retry_pending`, `failed`, `delivered`, `fresh`, `stale`, or `pruned`. |
| `尝试次数` | Bounded projection attempt count. |
| `最近投影时间` | Last successful projection timestamp when available. |
| `错误摘要` | Redacted operator-safe error summary only; never raw app/table/record IDs, callback URLs, or tokens. |
| `更新时间` | Status row update timestamp. |
| `版本` | Projection schema version. |

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

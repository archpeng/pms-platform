import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildLarkCliProvisioningPlan,
  createSmallHotelPmsBaseProvisioningSpec,
  executeLarkCliProvisioningPlan,
  normalizeHotelProfileCandidate,
  parseHotelProfileCandidateFromText,
  pmsBaseProvisioningSchemaVersion,
  smallHotelProfileFixture,
  validatePmsBaseProvisioningSpec,
  type HotelProfile,
  type PmsBaseProvisioningSpec,
} from '../src/index.js';

describe('PMS Base provisioning contract and generator - provisioning-validation', () => {
  it('rejects D6B projection status schema drift and tracked target placeholders', () => {
      const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
      const invalid: PmsBaseProvisioningSpec = {
        ...spec,
        tables: spec.tables.map((table) =>
          table.logicalName === 'ProjectionStatus'
            ? {
                ...table,
                fields: table.fields
                  .filter((field) => field.displayName !== '错误摘要')
                  .map((field) => field.displayName === '后端ID' ? { ...field, hidden: false } : field),
                upsertPolicy: undefined,
              }
            : table,
        ),
        adapterRegistryBindings: {
          ...spec.adapterRegistryBindings,
          pmsBaseProjection: {
            ...spec.adapterRegistryBindings.pmsBaseProjection,
            bindings: {
              ...spec.adapterRegistryBindings.pmsBaseProjection.bindings,
              projectionStatus: {
                ...spec.adapterRegistryBindings.pmsBaseProjection.bindings.projectionStatus,
                tableLogicalName: 'tbl123_real_status_table' as never,
              },
            },
          },
        },
      };
  
      expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
        expect.arrayContaining([
          'canonical_id_field_not_hidden:ProjectionStatus:后端ID',
          'projection_status_field_missing:错误摘要',
          'projection_status_upsert_policy_required',
          'tracked_target_value_forbidden:adapterRegistryBindings.pmsBaseProjection.bindings.projectionStatus.tableLogicalName',
        ]),
      );
    });
  
    
  
  it('rejects invalid specs before Feishu execution', () => {
      const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
      const invalid: PmsBaseProvisioningSpec = {
        ...spec,
        proof: {
          ...spec.proof,
          proofRoomNumbers: ['0308'],
        },
        tables: spec.tables.map((table) =>
          table.logicalName === 'OperationRequests'
            ? {
                ...table,
                fields: [
                  ...table.fields,
                  {
                    logicalName: 'duplicateStatus',
                    displayName: '操作状态',
                    kind: 'singleSelect',
                    required: true,
                  },
                ],
                upsertPolicy: undefined,
              }
            : table,
        ),
        adapterRegistryBindings: {
          ...spec.adapterRegistryBindings,
          pmsBaseProjection: {
            ...spec.adapterRegistryBindings.pmsBaseProjection,
            targetPolicy: {
              ...spec.adapterRegistryBindings.pmsBaseProjection.targetPolicy,
              exampleTargetHint: 'tbl123_real_looking_value',
            },
          },
        },
      };
  
      expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
        expect.arrayContaining([
          'proof_room_pair_required',
          'duplicate_field_display_name:OperationRequests:操作状态',
          'proof_room_seed_missing:0308',
          'operation_requests_upsert_policy_required',
          'tracked_target_value_forbidden:adapterRegistryBindings.pmsBaseProjection.targetPolicy.exampleTargetHint',
        ]),
      );
    });
  
    
  
  it('rejects D4A schema drift for canonical IDs and placeholder-only linked records', () => {
      const spec = createSmallHotelPmsBaseProvisioningSpec(smallHotelProfileFixture);
      const invalid: PmsBaseProvisioningSpec = {
        ...spec,
        tables: spec.tables.map((table) => {
          if (table.logicalName === 'OperationRequests') {
            return {
              ...table,
              fields: table.fields.filter((field) => field.displayName !== '后端ID'),
            };
          }
          if (table.logicalName === 'HousekeepingTasks') {
            return {
              ...table,
              fields: table.fields.map((field) =>
                field.displayName === '关联房间'
                  ? { ...field, kind: 'text', linkedRecord: undefined }
                  : field,
              ),
            };
          }
          if (table.logicalName === 'Reservations') {
            return {
              ...table,
              fields: table.fields.filter((field) => field.displayName !== '关联房间'),
            };
          }
          if (table.logicalName === 'OperationLogs') {
            return {
              ...table,
              fields: table.fields.map((field) =>
                field.displayName === '关联操作请求'
                  ? { ...field, required: true }
                  : field,
              ),
            };
          }
          if (table.logicalName === 'InventoryCalendar') {
            return {
              ...table,
              fields: table.fields.map((field) =>
                field.displayName === '关联房间'
                  ? {
                      ...field,
                      linkedRecord: {
                        targetTableLogicalName: 'tbl123_real_target' as never,
                        targetDisplayFieldName: 'rec_room_1',
                        cardinality: 'single',
                        configMode: 'symbolic',
                      },
                    }
                  : field,
              ),
            };
          }
          return table;
        }),
      };
  
      expect(validatePmsBaseProvisioningSpec(invalid)).toEqual(
        expect.arrayContaining([
          'canonical_id_field_missing:OperationRequests:后端ID',
          'linked_record_field_kind_invalid:HousekeepingTasks:关联房间',
          'linked_record_field_missing:Reservations:关联房间',
          'linked_record_field_must_be_optional:OperationLogs:关联操作请求',
          'linked_record_target_mismatch:InventoryCalendar:关联房间:RoomLedger',
          'tracked_target_value_forbidden:tables[7].fields[5].linkedRecord.targetTableLogicalName',
          'tracked_target_value_forbidden:tables[7].fields[5].linkedRecord.targetDisplayFieldName',
        ]),
      );
    });
  
    
  
  it('keeps PMS core/contracts free of Feishu SDK and adapter imports', () => {
      const files = [
        resolve(import.meta.dirname, '../../contracts/src/index.ts'),
        resolve(import.meta.dirname, '../../core/src/index.ts'),
      ];
  
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        expect(text).not.toMatch(/@larksuite|adapter-feishu|lark-cli|bitable/i);
      }
    });
  
});

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseProvisioningSpec['tables'][number]['logicalName']) {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  expect(table).toBeDefined();
  return table!;
}

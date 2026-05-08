import type { PmsBaseProvisioningSpec, PmsBaseTableLogicalName, PmsBaseTableSpec } from './schema.js';

const requiredTables: readonly PmsBaseTableLogicalName[] = [
  'RoomLedger',
  'OperationRequests',
  'HousekeepingTasks',
  'MaintenanceTickets',
  'Reservations',
  'Stays',
  'OperationLogs',
  'InventoryCalendar',
  'ProjectionStatus',
];

const requiredOperationRequestFields = [
  '请求令牌',
  '操作类型',
  '操作状态',
  '房号',
  '操作人',
  '原因',
  '请求时间',
  '请求JSON',
  '结果JSON',
  '版本',
] as const;

const requiredStayFields = [
  '后端ID',
  '预订号',
  '房号',
  '关联房间',
  '入住状态',
  '入住时间',
  '离店时间',
  '版本',
] as const;

const requiredProjectionStatusFields = [
  '后端ID',
  '投影名称',
  '聚合键',
  '状态',
  '尝试次数',
  '最近投影时间',
  '错误摘要',
  '更新时间',
  '版本',
] as const;

const requiredCanonicalIdFields: readonly {
  readonly tableLogicalName: PmsBaseTableLogicalName;
  readonly displayName: '后端ID';
}[] = [
  { tableLogicalName: 'RoomLedger', displayName: '后端ID' },
  { tableLogicalName: 'OperationRequests', displayName: '后端ID' },
  { tableLogicalName: 'HousekeepingTasks', displayName: '后端ID' },
  { tableLogicalName: 'MaintenanceTickets', displayName: '后端ID' },
  { tableLogicalName: 'Reservations', displayName: '后端ID' },
  { tableLogicalName: 'Stays', displayName: '后端ID' },
  { tableLogicalName: 'OperationLogs', displayName: '后端ID' },
  { tableLogicalName: 'InventoryCalendar', displayName: '后端ID' },
  { tableLogicalName: 'ProjectionStatus', displayName: '后端ID' },
];

const requiredLinkedRecordFields: readonly {
  readonly tableLogicalName: PmsBaseTableLogicalName;
  readonly displayName: string;
  readonly targetTableLogicalName: PmsBaseTableLogicalName;
}[] = [
  { tableLogicalName: 'HousekeepingTasks', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
  { tableLogicalName: 'MaintenanceTickets', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
  { tableLogicalName: 'Reservations', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
  { tableLogicalName: 'Stays', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
  { tableLogicalName: 'OperationLogs', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
  { tableLogicalName: 'OperationLogs', displayName: '关联操作请求', targetTableLogicalName: 'OperationRequests' },
  { tableLogicalName: 'InventoryCalendar', displayName: '关联房间', targetTableLogicalName: 'RoomLedger' },
];

export function validatePmsBaseProvisioningSpec(spec: PmsBaseProvisioningSpec): string[] {
  const errors: string[] = [];
  const tablesByName = new Map(spec.tables.map((table) => [table.logicalName, table]));

  for (const tableName of requiredTables) {
    if (!tablesByName.has(tableName)) {
      errors.push(`required_table_missing:${tableName}`);
    }
  }

  if (spec.proof.proofRoomNumbers.length < 2) {
    errors.push('proof_room_pair_required');
  }

  const seededRoomNumbers = new Set(
    tablesByName.get('RoomLedger')?.seedRecords
      .map((record) => stringValue(record.fields['房号']))
      .filter(isNonEmptyString) ?? [],
  );
  for (const proofRoomNumber of spec.proof.proofRoomNumbers) {
    if (!seededRoomNumbers.has(proofRoomNumber)) {
      errors.push(`proof_room_seed_missing:${proofRoomNumber}`);
    }
  }

  for (const table of spec.tables) {
    const displayNames = new Set<string>();
    for (const field of table.fields) {
      if (displayNames.has(field.displayName)) {
        errors.push(`duplicate_field_display_name:${table.logicalName}:${field.displayName}`);
      }
      displayNames.add(field.displayName);

      if (field.kind === 'linkedRecord') {
        if (!field.linkedRecord) {
          errors.push(`linked_record_config_missing:${table.logicalName}:${field.displayName}`);
        } else {
          if (!tablesByName.has(field.linkedRecord.targetTableLogicalName)) {
            errors.push(`linked_record_target_table_missing:${table.logicalName}:${field.displayName}:${field.linkedRecord.targetTableLogicalName}`);
          }
          if (field.linkedRecord.configMode !== 'symbolic') {
            errors.push(`linked_record_config_not_symbolic:${table.logicalName}:${field.displayName}`);
          }
        }
      }
    }
  }

  for (const requiredField of requiredCanonicalIdFields) {
    const field = tablesByName.get(requiredField.tableLogicalName)?.fields.find((candidate) => candidate.displayName === requiredField.displayName);
    if (!field) {
      errors.push(`canonical_id_field_missing:${requiredField.tableLogicalName}:${requiredField.displayName}`);
      continue;
    }
    if (field.kind !== 'text') {
      errors.push(`canonical_id_field_kind_invalid:${requiredField.tableLogicalName}:${requiredField.displayName}`);
    }
    if (field.hidden !== true) {
      errors.push(`canonical_id_field_not_hidden:${requiredField.tableLogicalName}:${requiredField.displayName}`);
    }
  }

  for (const requiredField of requiredLinkedRecordFields) {
    const field = tablesByName.get(requiredField.tableLogicalName)?.fields.find((candidate) => candidate.displayName === requiredField.displayName);
    if (!field) {
      errors.push(`linked_record_field_missing:${requiredField.tableLogicalName}:${requiredField.displayName}`);
      continue;
    }
    if (field.kind !== 'linkedRecord') {
      errors.push(`linked_record_field_kind_invalid:${requiredField.tableLogicalName}:${requiredField.displayName}`);
    }
    if (field.required) {
      errors.push(`linked_record_field_must_be_optional:${requiredField.tableLogicalName}:${requiredField.displayName}`);
    }
    if (field.linkedRecord?.targetTableLogicalName !== requiredField.targetTableLogicalName) {
      errors.push(`linked_record_target_mismatch:${requiredField.tableLogicalName}:${requiredField.displayName}:${requiredField.targetTableLogicalName}`);
    }
  }

  const operationRequests = tablesByName.get('OperationRequests');
  if (operationRequests) {
    for (const field of requiredOperationRequestFields) {
      if (!operationRequests.fields.some((candidate) => candidate.displayName === field)) {
        errors.push(`operation_request_field_missing:${field}`);
      }
    }
    if (!operationRequests.upsertPolicy) {
      errors.push('operation_requests_upsert_policy_required');
    }
  }

  const stays = tablesByName.get('Stays');
  if (stays) {
    for (const field of requiredStayFields) {
      if (!stays.fields.some((candidate) => candidate.displayName === field)) {
        errors.push(`stay_field_missing:${field}`);
      }
    }
    if (!stays.upsertPolicy) {
      errors.push('stays_upsert_policy_required');
    }
  }

  const projectionStatus = tablesByName.get('ProjectionStatus');
  if (projectionStatus) {
    for (const field of requiredProjectionStatusFields) {
      if (!projectionStatus.fields.some((candidate) => candidate.displayName === field)) {
        errors.push(`projection_status_field_missing:${field}`);
      }
    }
    if (!projectionStatus.upsertPolicy) {
      errors.push('projection_status_upsert_policy_required');
    }
  }

  for (const error of findTrackedTargetValues(spec)) {
    errors.push(error);
  }

  return errors;
}

function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseTableLogicalName): PmsBaseTableSpec {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  if (!table) {
    throw new Error(`table_missing:${logicalName}`);
  }
  return table;
}

function findTrackedTargetValues(value: unknown, path = ''): string[] {
  const errors: string[] = [];
  if (typeof value === 'string') {
    if (looksLikeTrackedTargetValue(value)) {
      errors.push(`tracked_target_value_forbidden:${path}`);
    }
    return errors;
  }
  if (!value || typeof value !== 'object') {
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => errors.push(...findTrackedTargetValues(entry, `${path}[${index}]`)));
    return errors;
  }
  for (const [key, entry] of Object.entries(value)) {
    errors.push(...findTrackedTargetValues(entry, path ? `${path}.${key}` : key));
  }
  return errors;
}

function looksLikeTrackedTargetValue(value: string): boolean {
  return /\b(?:app_token|base_token|table_id|field_id|view_id|form_id|record_id)\b/i.test(value)
    || /\b(?:bascn|tbl|fld|vew|frm)[a-zA-Z0-9_/-]{6,}\b/.test(value)
    || /\b(?:rec_[a-zA-Z0-9_/-]{3,}|rec[a-zA-Z0-9]{12,})\b/.test(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

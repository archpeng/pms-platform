import type { PmsBaseFieldKind, PmsBaseFieldSpec, PmsBaseTableLogicalName } from './schema.js';

export function textField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'text', required };
}

export function hiddenCanonicalIdField(): PmsBaseFieldSpec {
  return { logicalName: 'backendId', displayName: '后端ID', kind: 'text', required: false, hidden: true };
}

export function linkedRecordField(
  logicalName: string,
  displayName: string,
  targetTableLogicalName: PmsBaseTableLogicalName,
  targetDisplayFieldName: string,
): PmsBaseFieldSpec {
  return {
    logicalName,
    displayName,
    kind: 'linkedRecord',
    required: false,
    linkedRecord: {
      targetTableLogicalName,
      targetDisplayFieldName,
      cardinality: 'single',
      configMode: 'symbolic',
    },
  };
}

export function longTextField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'longText', required };
}

export function dateTimeField(logicalName: string, displayName: string, required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'dateTime', required };
}

export function selectField(logicalName: string, displayName: string, options: readonly string[], required = true): PmsBaseFieldSpec {
  return { logicalName, displayName, kind: 'singleSelect', options, required };
}

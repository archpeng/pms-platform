import type { PmsBaseFieldKind, PmsBaseFieldSpec, PmsBaseProvisioningSpec, PmsBaseTableLogicalName, PmsBaseTableSpec, PmsBaseViewSpec } from './schema.js';

export function toLarkFieldJson(field: PmsBaseFieldSpec): Record<string, unknown> {
  return {
    name: field.displayName,
    type: toLarkFieldType(field.kind),
    ...(field.hidden ? { hidden: true } : {}),
    ...(field.options ? { options: field.options.map((option) => ({ name: option })) } : {}),
    ...(field.linkedRecord
      ? {
          relation: {
            targetTableLogicalName: field.linkedRecord.targetTableLogicalName,
            targetDisplayFieldName: field.linkedRecord.targetDisplayFieldName,
            cardinality: field.linkedRecord.cardinality,
            configMode: field.linkedRecord.configMode,
          },
        }
      : {}),
  };
}

export function toLarkFieldType(kind: PmsBaseFieldKind): string {
  if (kind === 'singleSelect') return 'select';
  if (kind === 'dateTime') return 'datetime';
  if (kind === 'longText') return 'text';
  if (kind === 'linkedRecord') return 'link';
  return kind;
}

export function toLarkViewJson(view: PmsBaseViewSpec): Record<string, unknown> {
  return {
    name: view.displayName,
    type: view.kind,
  };
}

export function toRecordBatchJson(table: PmsBaseTableSpec): Record<string, unknown> {
  const fields = table.fields.map((field) => field.displayName);
  return {
    fields,
    rows: table.seedRecords.map((record) => fields.map((field) => record.fields[field] ?? null)),
  };
}

export function requiredTable(spec: PmsBaseProvisioningSpec, logicalName: PmsBaseTableLogicalName): PmsBaseTableSpec {
  const table = spec.tables.find((entry) => entry.logicalName === logicalName);
  if (!table) {
    throw new Error(`table_missing:${logicalName}`);
  }
  return table;
}

export function envRef(name: string): string {
  return `$${name}`;
}

export function envNameFromRef(ref: string): string {
  return ref.startsWith('$') ? ref.slice(1) : ref;
}

export function materializeEnvRefs(command: readonly string[], envRefs: readonly string[]): readonly string[] {
  if (envRefs.length === 0) {
    return command;
  }
  return command.map((part) => {
    if (!part.startsWith('$')) {
      return part;
    }
    const envName = part.slice(1);
    if (!envRefs.includes(envName)) {
      return part;
    }
    return process.env[envName] ?? part;
  });
}

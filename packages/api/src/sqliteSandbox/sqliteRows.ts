export function sqliteRows<Row>(value: unknown): Row[] {
  return value as Row[];
}

export function sqliteOptionalRow<Row>(value: unknown): Row | undefined {
  return value as Row | undefined;
}

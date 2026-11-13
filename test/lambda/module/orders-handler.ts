/**
 * A handler module reading its settings at module scope, as handlers commonly
 * do. Imported once per test file, by a function's first invocation.
 */
const tableName = process.env["ORDERS_TABLE"];
const loadedAt = Date.now();

export const handler = (): { tableName: string | null; loadedAt: number } => ({
  tableName: tableName ?? null,
  loadedAt,
});

export const onOrder = (): string => `orders in ${tableName ?? "nowhere"}`;

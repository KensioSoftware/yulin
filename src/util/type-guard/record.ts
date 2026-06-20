/**
 * Check if a given value is a Record<string, unknown>
 */
// eslint-disable-next-line no-restricted-syntax
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

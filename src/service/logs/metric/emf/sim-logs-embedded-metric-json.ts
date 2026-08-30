/**
 * The JSON readers an Embedded Metric Format document is taken apart with.
 *
 * A document is written by whatever produced the log line, so nothing about
 * its shape can be assumed. Each of these answers undefined for a value that
 * is not what the format calls for, and the caller decides whether that makes
 * the document unreadable or just that one metric unpublishable.
 */

/**
 * An object's own properties as a map, or undefined for anything else.
 */
export function embeddedMetricRecord(
  value: unknown,
): Map<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? new Map(Object.entries(value))
    : undefined;
}

/**
 * A string, or undefined for anything else.
 */
export function embeddedMetricString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * A finite number, or undefined for anything else.
 */
export function embeddedMetricNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Read every entry of a list through a reader, dropping the unreadable ones.
 */
export function embeddedMetricList<T>(
  value: unknown,
  read: (entry: unknown) => T | undefined,
): readonly T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => read(entry))
    .filter((entry) => entry !== undefined);
}

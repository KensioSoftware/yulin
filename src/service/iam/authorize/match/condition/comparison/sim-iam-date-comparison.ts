import { simIamNumberOf } from "./sim-iam-numeric-comparison.js";
import type { SimIamScalarConditionValue } from "./sim-iam-value-comparison.js";

/**
 * The start of an ISO 8601 date, which every date IAM accepts as text opens
 * with.
 */
const isoDatePrefix = /^\d{4}-\d{2}-\d{2}/u;

/**
 * Read one value as an instant, in milliseconds since the epoch.
 *
 * AWS takes a date as ISO 8601 text, such as `2026-01-01T00:00:00Z` or
 * `2026-01-01`, or as epoch seconds written either as a number or as text.
 * `aws:EpochTime` arrives in the second form and `aws:CurrentTime` in the
 * first, and a date operator compares either of them with either form.
 */
export function simIamInstantOf(
  value: SimIamScalarConditionValue,
): number | undefined {
  if (typeof value === "string" && isoDatePrefix.test(value)) {
    const instant = Date.parse(value);

    return Number.isNaN(instant) ? undefined : instant;
  }

  const epochSeconds = simIamNumberOf(value);

  return epochSeconds === undefined ? undefined : epochSeconds * 1000;
}

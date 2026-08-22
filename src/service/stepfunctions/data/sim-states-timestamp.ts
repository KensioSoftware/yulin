import type { JSONValue } from "../../../util/type-guard/json.js";
import { simStatesTimestampFieldsHold } from "./sim-states-timestamp-fields.js";

// RFC3339, which is the timestamp format Amazon States Language names. The
// looser formats Date.parse accepts are left out, so a plain "2026-07-26" is
// not a timestamp here and a comparison against one answers false rather than
// guessing at midnight in some zone.
const rfc3339 =
  // oxlint-disable-next-line security/detect-unsafe-regex -- no nested quantifier.
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

/**
 * Read a JSON value as an RFC3339 timestamp, in milliseconds since the epoch.
 *
 * Answers undefined for anything that is not one, which is what lets a
 * timestamp comparison and `IsTimestamp` tell a timestamp from a string that
 * merely looks like a date.
 */
export function readSimStatesTimestamp(
  value: JSONValue | undefined,
): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const written = rfc3339.exec(value);

  if (written === null || !simStatesTimestampFieldsHold(written.slice(1))) {
    return undefined;
  }

  return Date.parse(value);
}

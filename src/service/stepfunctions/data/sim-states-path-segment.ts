import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";

/**
 * One step along a Reference Path.
 */
export type SimStatesPathSegment =
  | { readonly kind: "field"; readonly name: string }
  | { readonly kind: "index"; readonly index: number };

/**
 * The value a Reference Path selects, or undefined where it selects nothing.
 *
 * Selecting nothing is the ordinary case rather than a fault. A `Choice` rule
 * testing `IsPresent` wants to know, and only the callers that need a value
 * turn the absence into a failure.
 */
export function selectSimStatesPath(
  document: JSONValue,
  segments: readonly SimStatesPathSegment[],
): JSONValue | undefined {
  let current: JSONValue | undefined = document;

  for (const segment of segments) {
    current = selectSegment(current, segment);

    if (current === undefined) {
      return undefined;
    }
  }

  return current;
}

/**
 * Step one segment into a value.
 */
function selectSegment(
  current: JSONValue | undefined,
  segment: SimStatesPathSegment,
): JSONValue | undefined {
  if (segment.kind === "index") {
    return Array.isArray(current) ? current[segment.index] : undefined;
  }

  return isRecord(current) ? current[segment.name] : undefined;
}

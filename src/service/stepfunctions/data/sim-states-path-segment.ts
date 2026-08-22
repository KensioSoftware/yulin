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
 *
 * A field is read only where the object owns it. A Reference Path identifies a
 * node in JSON data, and `$.toString` names a field a JSON document either has
 * or has not got. Reading the prototype chain would answer that path with a
 * JavaScript function.
 */
function selectSegment(
  current: JSONValue | undefined,
  segment: SimStatesPathSegment,
): JSONValue | undefined {
  if (segment.kind === "index") {
    return Array.isArray(current) ? current[segment.index] : undefined;
  }

  if (!isRecord(current) || !Object.hasOwn(current, segment.name)) {
    return undefined;
  }

  return current[segment.name];
}

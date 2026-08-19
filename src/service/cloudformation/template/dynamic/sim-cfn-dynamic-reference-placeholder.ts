import { randomBytes } from "node:crypto";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../value/sim-cfn-template-value.js";

/**
 * What stands in a resolved string for a reference still being read.
 *
 * Property resolution is synchronous, and a service such as Secrets Manager
 * cannot answer a reference without being waited on. The substitution
 * therefore happens in two steps. A marker goes into the string while the
 * template resolves, and the value replaces it once the service has answered.
 *
 * The marker is wrapped in a private use character (one nothing in a
 * CloudFormation template holds) and carries random bytes of its own. A
 * property holding text a template author wrote is therefore left alone, even
 * where that text was written to look like a marker. While it is in flight the
 * marker is opaque text, which is what an intrinsic function reading the
 * string around it sees. An `Fn::Split` over a value the service has yet to
 * answer with splits the marker.
 */
const placeholderPattern = /\u{E000}dynamic-reference-[\da-f]+-\d+\u{E000}/gu;

/** How many random bytes each resolution's markers are marked with. */
const markingLength = 8;

/**
 * What one resolution's markers are marked with, so that no other resolution
 * and nothing a template wrote produces the same marker.
 */
export function simCfnDynamicReferenceMarking(): string {
  return randomBytes(markingLength).toString("hex");
}

/**
 * The marker standing in for the reference at this position in a resolution.
 */
export function simCfnDynamicReferencePlaceholder(
  marking: string,
  position: number,
): string {
  return `\u{E000}dynamic-reference-${marking}-${String(position)}\u{E000}`;
}

/**
 * Replace every marker in a resolved template object with the value the
 * service answered with.
 *
 * A marker sits inside a string rather than being one, since a reference can
 * be written into the middle of a longer value, so each string is rewritten
 * rather than swapped. The rewrite goes through a function so that a value
 * holding `$&` or `$1` arrives as it was written.
 */
export function fillSimCfnDynamicReferencePlaceholders(
  properties: SimCfnTemplateValueRecord,
  values: ReadonlyMap<string, string>,
): SimCfnTemplateValueRecord {
  return filledRecord(properties, values);
}

function filled(
  value: SimCfnTemplateValue,
  values: ReadonlyMap<string, string>,
): SimCfnTemplateValue {
  if (typeof value === "string") {
    return value.replaceAll(
      placeholderPattern,
      (marker) => values.get(marker) ?? marker,
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry) => filled(entry, values));
  }

  if (value !== null && typeof value === "object") {
    return filledRecord(value, values);
  }

  return value;
}

function filledRecord(
  record: SimCfnTemplateValueRecord,
  values: ReadonlyMap<string, string>,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, filled(value, values)]),
  );
}

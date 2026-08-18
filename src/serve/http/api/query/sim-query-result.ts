/* oxlint-disable security/detect-object-injection -- every lookup here reads
   a member the operation's own result writer named, out of the output that
   operation produced. */

import { isRecord } from "../../../../util/type-guard/record.js";
import { xmlElement, xmlValue } from "../../../../util/xml/xml-writer.js";

/**
 * One simulated operation's output, as the members a Query result writes.
 */
export type SimQueryOutput = Readonly<Record<string, unknown>>;

/**
 * Write the named members of a structure, in the order they are given.
 *
 * Query writes a member the operation did not produce as no element at all
 * rather than as an empty one, which is what `xmlValue` does with an absent
 * value.
 */
export function queryMembers(
  value: SimQueryOutput,
  names: readonly string[],
): string {
  return names.map((name) => xmlValue(name, queryScalar(value[name]))).join("");
}

/**
 * Write a list member, whose items Query wraps one `member` element each.
 */
export function queryList(
  value: SimQueryOutput,
  name: string,
  item: (member: SimQueryOutput) => string,
): string {
  const items = value[name];
  if (!Array.isArray(items)) {
    return "";
  }

  const members = items
    .map((member) => xmlElement("member", item(asQueryOutput(member))))
    .join("");

  return xmlElement(name, members);
}

/**
 * Write a list member whose items are values rather than structures.
 */
export function queryScalarList(value: SimQueryOutput, name: string): string {
  const items = value[name];
  if (!Array.isArray(items)) {
    return "";
  }

  return xmlElement(
    name,
    items.map((item) => xmlValue("member", queryScalar(item))).join(""),
  );
}

/**
 * Write a map member, whose pairs Query wraps one `entry` element each.
 */
export function queryMap(value: SimQueryOutput, name: string): string {
  const map = value[name];
  if (!isRecord(map)) {
    return "";
  }

  const entries = Object.entries(map)
    .map(([key, entry]) =>
      xmlElement(
        "entry",
        xmlValue("key", key) + xmlValue("value", queryScalar(entry)),
      ),
    )
    .join("");

  return xmlElement(name, entries);
}

/**
 * Read an output member as the value XML text carries.
 *
 * A member the operation left out writes nothing, and so does a null. Both
 * mean the response has nothing to say about it. Anything that is not already
 * a scalar is a structure a Query member has no shape for, such as a
 * CloudFormation Output whose value resolved to a list, and it travels as its
 * JSON so the caller sees what it is rather than `[object Object]`.
 */
function queryScalar(
  value: unknown,
): string | number | boolean | Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function asQueryOutput(member: unknown): SimQueryOutput {
  return isRecord(member) ? member : {};
}

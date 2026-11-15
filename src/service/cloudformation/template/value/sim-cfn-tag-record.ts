import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "./sim-cfn-template-value.js";

/**
 * Read a resource's `Tags` property into a map of value by key, the shape
 * Lambda's `CreateFunction` and SQS's `CreateQueue` take tags in.
 *
 * A template writes tags as a list of `Key`/`Value` pairs, which is also what
 * CDK synthesises for `Tags.of(...).add(...)`. A number or boolean value is
 * read as its string, as CloudFormation reads one, and a missing value is
 * empty. An entry that is not a pair at all is dropped, and the stack goes on.
 */
export function simCfnTagRecord(
  tags: SimCfnTemplateValue | undefined,
): Record<string, string> | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const entries = tags.flatMap(
    (tag: SimCfnTemplateValue): [string, string][] => {
      if (!isRecord(tag)) {
        return [];
      }

      const key = scalarString(tag["Key"]);
      // CloudFormation declares Value optional, and a tag without one carries
      // an empty value.
      const value = scalarString(tag["Value"] ?? "");

      return key === undefined || value === undefined ? [] : [[key, value]];
    },
  );

  return Object.fromEntries(entries);
}

function scalarString(
  value: SimCfnTemplateValue | undefined,
): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return undefined;
}

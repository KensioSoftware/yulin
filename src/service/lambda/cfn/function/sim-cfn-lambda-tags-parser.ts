import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Parse the AWS::Lambda::Function Tags property into the map CreateFunction
 * takes.
 *
 * A template writes tags as a list of `Key`/`Value` pairs, which is also what
 * CDK synthesises for `Tags.of(...).add(...)`. A number or boolean value is
 * read as its string, as CloudFormation reads one. An entry that is not a pair
 * at all is dropped rather than failing the stack, since a tag changes nothing
 * a function does.
 */
export function simCfnLambdaTags(
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
      const value = scalarString(tag["Value"]);

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

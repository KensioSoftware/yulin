import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Read a template value as a number, or as nothing when it is not one.
 *
 * CloudFormation carries a number as a string when it came from a template
 * Parameter, so both are read.
 */
export function readSimCfnDynamoDbNumber(
  value: SimCfnTemplateValue,
): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * Read a template value as a boolean, or as nothing when it is not one.
 *
 * CloudFormation carries a boolean as a string when it came from a template
 * Parameter, so both are read. Anything else is nothing rather than false,
 * since what the template asked for is not knowable.
 */
export function readSimCfnDynamoDbBoolean(
  value: SimCfnTemplateValue,
): boolean | undefined {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return undefined;
}

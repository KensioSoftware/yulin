import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/** How a reader reports a property it cannot read. */
export type SimCfnSesPropertyFailure = (reason: string) => Error;

/**
 * Reads the scalar values of an AWS::SES::* Resource property.
 *
 * CloudFormation is loose about these types. A boolean written literally in a
 * template arrives as a boolean, and the same boolean reaching a Resource
 * through a String Parameter or an `Fn::Sub` arrives as `"true"`. Both are
 * read here, and a value that is neither is refused by name.
 */
export function sesCfnString(
  value: SimCfnTemplateValue | undefined,
  path: string,
  fail: SimCfnSesPropertyFailure,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw fail(`${path} must be a string`);
  }

  return value;
}

/**
 * A boolean, written as one or as the string CloudFormation carried it in.
 */
export function sesCfnBoolean(
  value: SimCfnTemplateValue | undefined,
  path: string,
  fail: SimCfnSesPropertyFailure,
): boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "false") {
    return value === "true";
  }

  throw fail(`${path} must be a boolean`);
}

/**
 * A number, written as one or as the string CloudFormation carried it in.
 */
export function sesCfnNumber(
  value: SimCfnTemplateValue | undefined,
  path: string,
  fail: SimCfnSesPropertyFailure,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === "string" ? fromString(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw fail(`${path} must be a number`);
  }

  return parsed;
}

/**
 * A list of strings, refusing a bare one written where a list belongs.
 */
export function sesCfnStringList(
  value: SimCfnTemplateValue | undefined,
  path: string,
  fail: SimCfnSesPropertyFailure,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw fail(`${path} must be a list`);
  }

  return value.map((member) => {
    if (typeof member !== "string") {
      throw fail(`${path} must be a list of strings`);
    }

    return member;
  });
}

/**
 * A number written as a string, or nothing where the string holds no number.
 *
 * `Number("")` and `Number("  ")` are both `0`, which would take a property
 * left blank in a template and store it as a real zero.
 */
function fromString(value: string): number | undefined {
  return value.trim().length === 0 ? undefined : Number(value);
}

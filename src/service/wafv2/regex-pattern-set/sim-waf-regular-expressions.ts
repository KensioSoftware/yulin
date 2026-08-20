import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import { simWafRegExp } from "../statement/sim-waf-regex.js";

/**
 * Minimal structural WAFv2 Regex.
 */
export interface SimWafRegularExpressionInput {
  readonly RegexString?: string | undefined;
}

/**
 * Read the expressions a pattern set was written with.
 */
export function simWafPatternStrings(
  regularExpressions: readonly SimWafRegularExpressionInput[],
): readonly string[] {
  return regularExpressions.map((regularExpression) =>
    requiredRegexString(regularExpression),
  );
}

function requiredRegexString(
  regularExpression: SimWafRegularExpressionInput,
): string {
  if (regularExpression.RegexString === undefined) {
    throw new SimWafInvalidParameterException(
      "Error reason: A regular expression needs a RegexString, field: " +
        "REGULAR_EXPRESSION, parameter: RegexString",
    );
  }

  return regularExpression.RegexString;
}

/**
 * Compile one expression, refusing one that will not compile.
 */
export function compiledSimWafExpression(pattern: string): RegExp {
  const expression = simWafRegExp(pattern);

  if (expression === undefined) {
    throw new SimWafInvalidParameterException(
      `Error reason: The regular expression is not valid, field: ` +
        `REGULAR_EXPRESSION, parameter: ${pattern}`,
    );
  }

  return expression;
}

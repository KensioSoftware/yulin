import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import {
  SimWafResource,
  type SimWafResourceProperties,
} from "../resource/sim-waf-resource.js";
import { simWafRegExp } from "../statement/sim-waf-regex.js";

/**
 * Minimal structural WAFv2 Regex.
 */
export interface SimWafRegularExpressionInput {
  readonly RegexString?: string | undefined;
}

interface SimWafRegexPatternSetProperties extends SimWafResourceProperties {
  readonly regularExpressions: readonly SimWafRegularExpressionInput[];
}

/**
 * One named list of regular expressions a rule can point at.
 *
 * The patterns are compiled when the set is created, so an expression that
 * will not compile is refused where it was written rather than quietly
 * matching nothing when a request arrives.
 */
export class SimWafRegexPatternSet extends SimWafResource {
  public readonly regularExpressions: readonly string[];
  public readonly expressions: readonly RegExp[];

  constructor(properties: SimWafRegexPatternSetProperties) {
    super("regexpatternset", properties);

    this.regularExpressions = properties.regularExpressions.map(
      (regularExpression) => requiredRegexString(regularExpression),
    );
    this.expressions = this.regularExpressions.map((pattern) =>
      compiled(pattern),
    );
  }
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

function compiled(pattern: string): RegExp {
  const expression = simWafRegExp(pattern);

  if (expression === undefined) {
    throw new SimWafInvalidParameterException(
      `Error reason: The regular expression is not valid, field: ` +
        `REGULAR_EXPRESSION, parameter: ${pattern}`,
    );
  }

  return expression;
}

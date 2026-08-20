import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import type { SimWafValueTest } from "./sim-waf-field-match.js";
import { simWafRegExp } from "./sim-waf-regex.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import { SimWafNonexistentItemException } from "../error/sim-wafv2.error.js";

/**
 * Minimal structural WAFv2 RegexMatchStatement.
 */
export interface SimWafRegexMatchStatementInput {
  readonly RegexString?: string | undefined;
}

/**
 * Minimal structural WAFv2 RegexPatternSetReferenceStatement.
 */
export interface SimWafRegexPatternSetReferenceInput {
  readonly ARN?: string | undefined;
}

/**
 * Build the test a RegexMatchStatement puts each string through.
 */
export function simWafRegexTest(
  statement: SimWafRegexMatchStatementInput,
  ruleName: string,
): SimWafValueTest {
  const pattern = statement.RegexString;

  if (pattern === undefined) {
    invalidSimWafRule(ruleName, "RegexMatchStatement needs a RegexString");
  }

  const expression = simWafRegExp(pattern);

  if (expression === undefined) {
    invalidSimWafRule(
      ruleName,
      `The regular expression ${pattern} is not valid`,
    );
  }

  return (value): boolean => expression.test(value);
}

/**
 * Build the test a RegexPatternSetReferenceStatement puts each string through.
 *
 * The set is resolved when the rule is written rather than when a request
 * arrives, so an ARN naming nothing is refused by CreateWebACL the way real
 * WAF refuses it. The patterns themselves are read at match time, from the set
 * the reference resolved to, so a rule follows the set it names.
 */
export function simWafRegexPatternSetTest(
  statement: SimWafRegexPatternSetReferenceInput,
  ruleName: string,
  regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>,
): SimWafValueTest {
  const arn = statement.ARN;

  if (arn === undefined) {
    invalidSimWafRule(
      ruleName,
      "RegexPatternSetReferenceStatement needs an ARN",
    );
  }

  const patternSet = regexPatternSets.findByArn(arn);

  if (patternSet === undefined) {
    throw new SimWafNonexistentItemException(
      `AWS WAF couldn't perform the operation because your resource doesn't ` +
        `exist: the rule ${ruleName} refers to the regex pattern set ${arn}.`,
    );
  }

  return (value): boolean =>
    patternSet.expressions.some((expression) => expression.test(value));
}

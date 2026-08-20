import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import { simWafByteMatchTest } from "./sim-waf-byte-match.js";
import {
  compileSimWafFieldMatcher,
  type SimWafMatcher,
} from "./sim-waf-field-match.js";
import {
  simWafRegexPatternSetTest,
  simWafRegexTest,
} from "./sim-waf-regex-match.js";
import { compileSimWafLogicalStatement } from "./sim-waf-logical-statement.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import { simWafSizeTest } from "./sim-waf-size-constraint.js";
import type {
  SimWafFieldStatementInput,
  SimWafStatementInput,
} from "./sim-waf-statement.type.js";
import { refuseUnsimulatedSimWafStatement } from "./sim-waf-unsimulated-statement.js";

/**
 * What a statement needs from the rest of the simulation to be compiled.
 */
export interface SimWafStatementScope {
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
  readonly ruleName: string;
}

/**
 * Turn one statement into the matcher a rule evaluates a request with.
 *
 * Compiling happens when the web ACL is written rather than when a request
 * arrives, which is what lets `CreateWebACL` refuse a statement kind it cannot
 * evaluate. It also means a rule does no parsing per request: what a request
 * meets is a closure over what the rule already worked out.
 */
export function compileSimWafStatement(
  statement: SimWafStatementInput | undefined,
  scope: SimWafStatementScope,
): SimWafMatcher {
  const { ruleName } = scope;

  if (statement === undefined) {
    invalidSimWafRule(ruleName, "A rule needs a Statement");
  }

  refuseUnsimulatedSimWafStatement(statement, ruleName);

  return (
    compileFieldStatement(statement, scope) ??
    compileSimWafLogicalStatement(statement, scope)
  );
}

function compileFieldStatement(
  statement: SimWafStatementInput,
  scope: SimWafStatementScope,
): SimWafMatcher | undefined {
  const { ruleName } = scope;

  if (statement.ByteMatchStatement !== undefined) {
    const byteMatch = statement.ByteMatchStatement;

    return fieldMatcher(
      byteMatch,
      ruleName,
      simWafByteMatchTest(byteMatch, ruleName),
    );
  }

  if (statement.RegexMatchStatement !== undefined) {
    const regexMatch = statement.RegexMatchStatement;

    return fieldMatcher(
      regexMatch,
      ruleName,
      simWafRegexTest(regexMatch, ruleName),
    );
  }

  if (statement.RegexPatternSetReferenceStatement !== undefined) {
    const reference = statement.RegexPatternSetReferenceStatement;

    return fieldMatcher(
      reference,
      ruleName,
      simWafRegexPatternSetTest(reference, ruleName, scope.regexPatternSets),
    );
  }

  if (statement.SizeConstraintStatement !== undefined) {
    const size = statement.SizeConstraintStatement;

    return fieldMatcher(size, ruleName, simWafSizeTest(size, ruleName));
  }

  return undefined;
}

function fieldMatcher(
  statement: SimWafFieldStatementInput,
  ruleName: string,
  test: (value: string) => boolean,
): SimWafMatcher {
  return compileSimWafFieldMatcher({
    field: statement.FieldToMatch,
    transformations: statement.TextTransformations,
    ruleName,
    test,
  });
}

import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../policy/sim-iam-policy.js";
import type { SimIamConditionMatch } from "./sim-iam-condition-match.js";
import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";
import { SimIamConditionOperatorParser } from "./sim-iam-condition-operator-parser.js";

/**
 * Matches IAM policy conditions against request condition-context values.
 *
 * This class coordinates condition-block evaluation and case-insensitive context
 * key lookup. Individual condition operators encapsulate value validation,
 * comparison, and set semantics.
 *
 * An unsupported operator fails closed by making the condition non-matching,
 * and is named in the result so the decision can report the statement as one
 * it never read. A context key the request carries no value for is left to the
 * operator, which answers for itself whether an absent key matches it.
 */
export class SimIamPolicyConditionMatcher {
  private static readonly noCondition: SimIamConditionMatch = {
    matched: true,
    unsupportedOperators: [],
  };

  private readonly conditionContext: ReadonlyMap<string, SimIamConditionValue>;

  constructor(
    conditionContext: Readonly<Record<string, SimIamConditionValue>>,
    private readonly operatorParser = new SimIamConditionOperatorParser(),
  ) {
    this.conditionContext = new Map(
      Object.entries(conditionContext).map(([key, value]) => [
        this.normalizeContextKey(key),
        value,
      ]),
    );
  }

  /**
   * Match every operator and every key in a condition block.
   *
   * Separate operators and separate keys use logical AND semantics.
   *
   * Every operator in the block is read. Stopping at the first that fails
   * would leave the operators the simulator could not evaluate depending on
   * the order the policy happens to list them in.
   */
  matches(
    condition: SimIamPolicyDocumentCondition | undefined,
  ): SimIamConditionMatch {
    if (condition === undefined) {
      return SimIamPolicyConditionMatcher.noCondition;
    }

    const unsupportedOperators: string[] = [];
    let matched = true;

    for (const [keyword, keyValues] of Object.entries(condition)) {
      const operator = this.operatorParser.parse(keyword);

      if (operator === undefined) {
        unsupportedOperators.push(keyword);
        continue;
      }

      matched = this.operatorMatches(operator, keyValues) && matched;
    }

    return {
      matched: matched && unsupportedOperators.length === 0,
      unsupportedOperators: matched ? unsupportedOperators : [],
    };
  }

  private operatorMatches(
    operator: SimIamConditionOperator,
    keyValues: Readonly<Record<string, SimIamConditionValue>>,
  ): boolean {
    return Object.entries(keyValues).every(([key, expected]) =>
      this.entryMatches(operator, key, expected),
    );
  }

  private entryMatches(
    operator: SimIamConditionOperator,
    key: string,
    expected: SimIamConditionValue,
  ): boolean {
    const actual = this.conditionContext.get(this.normalizeContextKey(key));

    if (actual === undefined) {
      return operator.matchesAbsentKey;
    }

    return operator.matches(actual, expected);
  }

  private normalizeContextKey(key: string): string {
    return key.toLowerCase();
  }
}

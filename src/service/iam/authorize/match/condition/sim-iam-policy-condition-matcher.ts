import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../policy/sim-iam-policy.js";
import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";
import { SimIamConditionOperatorParser } from "./sim-iam-condition-operator-parser.js";

/**
 * Matches IAM policy conditions against request condition-context values.
 *
 * This class coordinates condition-block evaluation and case-insensitive context
 * key lookup. Individual condition operators encapsulate value validation,
 * comparison, and set semantics.
 *
 * An unsupported operator fails closed by making the condition non-matching. A
 * context key the request carries no value for is left to the operator: a
 * positive one has nothing to compare and matches nothing, while a negated one
 * matches, as AWS documents.
 */
export class SimIamPolicyConditionMatcher {
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
   */
  matches(condition: SimIamPolicyDocumentCondition | undefined): boolean {
    if (condition === undefined) {
      return true;
    }

    return Object.entries(condition).every(([keyword, keyValues]) =>
      this.operatorMatches(keyword, keyValues),
    );
  }

  private operatorMatches(
    keyword: string,
    keyValues: Readonly<Record<string, SimIamConditionValue>>,
  ): boolean {
    const operator = this.operatorParser.parse(keyword);

    /* v8 ignore if -- defensive */
    if (operator === undefined) {
      return false;
    }

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

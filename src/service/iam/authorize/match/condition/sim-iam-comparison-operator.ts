import type { SimIamConditionValue } from "../../../policy/sim-iam-policy.js";
import {
  simIamScalarValues,
  type SimIamComparisonKeyword,
  type SimIamScalarConditionValue,
} from "./comparison/sim-iam-value-comparison.js";
import type { SimIamPolicyVariables } from "../variable/sim-iam-policy-variables.js";
import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";

/**
 * How an operator reads the values a request carries for a key.
 *
 * An unqualified operator needs a single value. `ForAnyValue` needs one of a
 * set to satisfy the comparison, and `ForAllValues` needs every one of them
 * to.
 */
export type SimIamSetQualifier = "ForAnyValue" | "ForAllValues" | undefined;

/**
 * A condition operator built from one comparison, its negation and its set
 * qualifier.
 *
 * Several policy values are an OR under a positive keyword and an AND under a
 * negated one. `StringNotEquals` with three values needs the request value to
 * differ from all three.
 *
 * A value either side cannot read, such as a word under a numeric keyword,
 * fails the whole condition, negated or not.
 *
 * A policy value whose variable has no value equals nothing and is like
 * nothing. A positive keyword finds no match in it, and a negated one matches.
 */
export class SimIamComparisonOperator implements SimIamConditionOperator {
  constructor(
    private readonly keyword: SimIamComparisonKeyword,
    private readonly qualifier: SimIamSetQualifier,
  ) {}

  /**
   * Answer for a request carrying no value for the key.
   *
   * AWS documents three rules. `ForAllValues` matches, because every value the
   * request carries satisfies it when it carries none. `ForAnyValue` fails,
   * because no value is there to satisfy it. An unqualified operator fails
   * when positive and matches when negated.
   */
  matchesAbsentKey(): boolean {
    if (this.qualifier === "ForAllValues") {
      return true;
    }

    return this.qualifier === undefined && this.keyword.negated;
  }

  /**
   * Answer for a request carrying a value for the key.
   */
  matches(
    actual: SimIamConditionValue,
    expected: SimIamConditionValue,
    variables?: SimIamPolicyVariables,
  ): boolean {
    const actualValues = this.requestValues(actual);

    if (actualValues === undefined) {
      return false;
    }

    const answers = actualValues.map((value) =>
      this.valueMatches(value, simIamScalarValues(expected), variables),
    );

    if (answers.includes(undefined)) {
      return false;
    }

    return this.qualifier === "ForAllValues"
      ? answers.every(Boolean)
      : answers.some(Boolean);
  }

  /**
   * The request values to compare, or undefined where an unqualified operator
   * is given a list.
   *
   * An empty list leaves `ForAllValues` with nothing to contradict it, which
   * AWS reads as a match, and `ForAnyValue` with nothing to satisfy it.
   */
  private requestValues(
    actual: SimIamConditionValue,
  ): readonly SimIamScalarConditionValue[] | undefined {
    if (this.qualifier !== undefined) {
      return simIamScalarValues(actual);
    }

    return typeof actual === "object" ? undefined : [actual];
  }

  /**
   * Whether one request value satisfies the policy values, or undefined where
   * a value cannot be read.
   */
  private valueMatches(
    actual: SimIamScalarConditionValue,
    expectedValues: readonly SimIamScalarConditionValue[],
    variables: SimIamPolicyVariables | undefined,
  ): boolean | undefined {
    const results = expectedValues.map((expected) =>
      this.compare(actual, expected, variables),
    );

    if (results.includes(undefined)) {
      return undefined;
    }

    return this.keyword.negated
      ? results.every((result) => result === false)
      : results.includes(true);
  }

  /**
   * Compare one request value with one policy value, replacing the policy
   * value's variables first where the keyword takes them.
   */
  private compare(
    actual: SimIamScalarConditionValue,
    expected: SimIamScalarConditionValue,
    variables: SimIamPolicyVariables | undefined,
  ): boolean | undefined {
    const mode = this.keyword.substitution;

    if (
      mode === undefined ||
      variables === undefined ||
      typeof expected !== "string"
    ) {
      return this.keyword.comparison(actual, expected);
    }

    const resolved = variables.resolve(expected, mode);

    return resolved !== undefined && this.keyword.comparison(actual, resolved);
  }
}

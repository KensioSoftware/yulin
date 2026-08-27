import type { SimIamConditionOperatorFactory } from "../sim-iam-condition-operator.js";
import type { SimIamStringComparison } from "../sim-iam-string-comparison.js";
import {
  simIamArnComparison,
  simIamStringEqualsComparison,
  simIamStringLikeComparison,
} from "../sim-iam-string-comparison.js";
import { SimIamNegatedForAllValuesStringOperator } from "./sim-iam-negated-for-all-values-string-operator.js";
import { SimIamNegatedForAnyValueStringOperator } from "./sim-iam-negated-for-any-value-string-operator.js";
import { SimIamNegatedScalarStringOperator } from "./sim-iam-negated-scalar-string-operator.js";

/**
 * The comparison behind each negated operator keyword.
 */
const negatedComparisons: ReadonlyMap<string, SimIamStringComparison> = new Map(
  [
    ["ArnNotEquals", simIamArnComparison],
    ["ArnNotLike", simIamArnComparison],
    ["StringNotEquals", simIamStringEqualsComparison],
    ["StringNotLike", simIamStringLikeComparison],
  ],
);

/**
 * Build the unqualified and set forms of one negated keyword.
 */
function keywordForms(
  keyword: string,
  comparison: SimIamStringComparison,
): readonly [string, SimIamConditionOperatorFactory][] {
  return [
    [
      keyword,
      (): SimIamNegatedScalarStringOperator =>
        new SimIamNegatedScalarStringOperator(comparison),
    ],
    [
      `ForAnyValue:${keyword}`,
      (): SimIamNegatedForAnyValueStringOperator =>
        new SimIamNegatedForAnyValueStringOperator(comparison),
    ],
    [
      `ForAllValues:${keyword}`,
      (): SimIamNegatedForAllValuesStringOperator =>
        new SimIamNegatedForAllValuesStringOperator(comparison),
    ],
  ];
}

/**
 * Every negated condition operator sim IAM evaluates, keyed by its keyword.
 */
export const simIamNegatedOperatorFactories: ReadonlyMap<
  string,
  SimIamConditionOperatorFactory
> = new Map(
  [...negatedComparisons].flatMap(([keyword, comparison]) =>
    keywordForms(keyword, comparison),
  ),
);

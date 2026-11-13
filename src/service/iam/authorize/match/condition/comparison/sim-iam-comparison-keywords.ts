import { simIamBinaryComparison } from "./sim-iam-binary-comparison.js";
import { simIamBoolComparison } from "./sim-iam-bool-comparison.js";
import { simIamInstantOf } from "./sim-iam-date-comparison.js";
import { simIamIpAddressComparison } from "./sim-iam-ip-comparison.js";
import {
  simIamNumberOf,
  simIamOrderedComparison,
  simIamOrders,
} from "./sim-iam-numeric-comparison.js";
import {
  simIamArnComparison,
  simIamStringEqualsComparison,
  simIamStringEqualsIgnoreCaseComparison,
  simIamStringLikeComparison,
} from "./sim-iam-string-comparison.js";
import type {
  SimIamComparisonKeyword,
  SimIamValueComparison,
} from "./sim-iam-value-comparison.js";

/**
 * A positive keyword and its negated sibling, both over one comparison.
 */
function pair(
  positive: string,
  negated: string,
  comparison: SimIamValueComparison,
): readonly [string, SimIamComparisonKeyword][] {
  return [
    [positive, { comparison, negated: false }],
    [negated, { comparison, negated: true }],
  ];
}

/**
 * The six numeric or date keywords sharing one prefix, such as
 * `NumericLessThan` and `NumericNotEquals`.
 */
function orderedFamily(
  prefix: string,
  read: (value: Parameters<SimIamValueComparison>[0]) => number | undefined,
): readonly [string, SimIamComparisonKeyword][] {
  return [...simIamOrders].flatMap(([suffix, accepts]) => {
    const comparison = simIamOrderedComparison(read, accepts);

    return suffix === "Equals"
      ? pair(`${prefix}Equals`, `${prefix}NotEquals`, comparison)
      : [[`${prefix}${suffix}`, { comparison, negated: false }]];
  });
}

/**
 * Every comparison keyword IAM documents, before any set qualifier or
 * `IfExists` suffix is applied to it.
 *
 * `Null` is absent. It asks whether a key is present and compares nothing.
 */
export const simIamComparisonKeywords: ReadonlyMap<
  string,
  SimIamComparisonKeyword
> = new Map([
  ...pair("StringEquals", "StringNotEquals", simIamStringEqualsComparison),
  ...pair(
    "StringEqualsIgnoreCase",
    "StringNotEqualsIgnoreCase",
    simIamStringEqualsIgnoreCaseComparison,
  ),
  ...pair("StringLike", "StringNotLike", simIamStringLikeComparison),
  ...orderedFamily("Numeric", simIamNumberOf),
  ...orderedFamily("Date", simIamInstantOf),
  ["Bool", { comparison: simIamBoolComparison, negated: false }],
  ["BinaryEquals", { comparison: simIamBinaryComparison, negated: false }],
  ...pair("IpAddress", "NotIpAddress", simIamIpAddressComparison),
  ...pair("ArnEquals", "ArnNotEquals", simIamArnComparison),
  ...pair("ArnLike", "ArnNotLike", simIamArnComparison),
]);

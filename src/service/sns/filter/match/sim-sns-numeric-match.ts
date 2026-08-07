import type { JSONValue } from "../../../../util/type-guard/json.js";
import {
  filterPolicyList,
  simSnsFilterPolicyRefusal,
} from "../sim-sns-filter-refusals.js";
import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsNumericOperator = "numeric";

/**
 * The comparators real SNS writes a numeric condition with.
 */
const comparators = new Map<
  string,
  (value: number, operand: number) => boolean
>([
  ["=", (value, operand): boolean => value === operand],
  ["<", (value, operand): boolean => value < operand],
  ["<=", (value, operand): boolean => value <= operand],
  [">", (value, operand): boolean => value > operand],
  [">=", (value, operand): boolean => value >= operand],
]);

/**
 * The comparison one comparator makes, if it is one real SNS has.
 */
function comparatorFor(
  comparator: JSONValue | undefined,
): ((value: number, operand: number) => boolean) | undefined {
  if (typeof comparator !== "string") {
    return undefined;
  }

  return comparators.get(comparator);
}

/**
 * One half of a numeric condition, such as `">", 100`.
 *
 * A range is two of these rather than a form of its own, which is how it is
 * written: `[">", 0, "<=", 100]` is the same two comparisons a policy could
 * have made one at a time, and both have to hold.
 */
class SimSnsNumericComparison {
  private readonly compare: (value: number, operand: number) => boolean;
  private readonly operand: number;

  private constructor(
    compare: (value: number, operand: number) => boolean,
    operand: number,
  ) {
    this.compare = compare;
    this.operand = operand;
  }

  /**
   * Read one comparator and the number it compares against.
   */
  static of(
    comparator: JSONValue | undefined,
    operand: JSONValue | undefined,
  ): SimSnsNumericComparison {
    const compare = comparatorFor(comparator);

    if (compare === undefined) {
      throw simSnsFilterPolicyRefusal(
        `numeric match takes one of =, <, <=, > or >=, and this one takes ${JSON.stringify(
          comparator,
        )}`,
      );
    }

    if (typeof operand !== "number") {
      throw simSnsFilterPolicyRefusal(
        `numeric match compares against a number, and this one compares ` +
          `against ${JSON.stringify(operand)}`,
      );
    }

    return new this(compare, operand);
  }

  /**
   * Whether a number the message carries satisfies this comparison.
   */
  holds(value: number): boolean {
    return this.compare(value, this.operand);
  }
}

/**
 * Read the comparator and operand pairs a numeric condition is written as.
 */
function comparisonsIn(operand: JSONValue): readonly SimSnsNumericComparison[] {
  const written = filterPolicyList(operand, simSnsNumericOperator);

  if (written.length === 0 || written.length % 2 !== 0) {
    throw simSnsFilterPolicyRefusal(
      `numeric match is a comparator and a number, optionally twice for a ` +
        `range, and this one is ${JSON.stringify(operand)}`,
    );
  }

  const comparisons: SimSnsNumericComparison[] = [];

  for (let index = 0; index < written.length; index += 2) {
    const [comparator, against] = written.slice(index, index + 2);

    comparisons.push(SimSnsNumericComparison.of(comparator, against));
  }

  return comparisons;
}

/**
 * `{"numeric": [">", 100]}`, and `{"numeric": [">", 0, "<=", 100]}` for a range.
 *
 * Only a number is compared numerically, so this matches a `Number` message
 * attribute and a JSON number in a message body. A `String` attribute holding
 * digits is text as far as real SNS is concerned, and matches nothing here.
 */
export class SimSnsNumericMatch extends SimSnsFilterMatch {
  private readonly comparisons: readonly SimSnsNumericComparison[];

  constructor(comparisons: readonly SimSnsNumericComparison[]) {
    super();
    this.comparisons = comparisons;
  }

  /**
   * Read the comparisons a numeric condition is written as.
   */
  static of(operand: JSONValue): SimSnsNumericMatch {
    return new this(comparisonsIn(operand));
  }

  /**
   * Whether the value is a number every comparison holds for.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    const numeric = value.numeric;

    if (numeric === undefined) {
      return false;
    }

    return this.comparisons.every((comparison) => comparison.holds(numeric));
  }
}

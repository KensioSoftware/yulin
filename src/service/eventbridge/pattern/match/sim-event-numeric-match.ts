import type { JSONValue } from "../../../../util/type-guard/json.js";
import {
  eventPatternRefusal,
  patternList,
} from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator name real EventBridge gives this match.
 */
export const eventPatternNumericOperator = "numeric";

/**
 * The comparators real EventBridge writes a numeric condition with.
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
 * One half of a numeric condition, such as `">", 100`.
 *
 * A range is two of these rather than a form of its own, which is how it is
 * written: `[">", 0, "<=", 100]` is the same two comparisons a pattern could
 * have made one at a time, and both have to hold.
 */
class SimEventNumericComparison {
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
  ): SimEventNumericComparison {
    const compare = this.comparatorFor(comparator);

    if (compare === undefined) {
      throw eventPatternRefusal(
        `${eventPatternNumericOperator} match takes one of =, <, <=, > or ` +
          `>=, and this one takes ${JSON.stringify(comparator)}`,
      );
    }

    if (typeof operand !== "number") {
      throw eventPatternRefusal(
        `${eventPatternNumericOperator} match compares against a number, and ` +
          `this one compares against ${JSON.stringify(operand)}`,
      );
    }

    return new this(compare, operand);
  }

  /**
   * The comparison one comparator makes, if it is one EventBridge has.
   */
  private static comparatorFor(
    comparator: JSONValue | undefined,
  ): ((value: number, operand: number) => boolean) | undefined {
    if (typeof comparator !== "string") {
      return undefined;
    }

    return comparators.get(comparator);
  }

  /**
   * Whether a number the event carries satisfies this comparison.
   */
  holds(value: number): boolean {
    return this.compare(value, this.operand);
  }
}

/**
 * Read the comparator and operand pairs a numeric condition is written as.
 */
function comparisonsIn(
  operand: JSONValue,
): readonly SimEventNumericComparison[] {
  const written = patternList(operand, eventPatternNumericOperator);

  if (written.length === 0 || written.length % 2 !== 0) {
    throw eventPatternRefusal(
      `${eventPatternNumericOperator} match is a comparator and a number, ` +
        `optionally twice for a range, and this one is ${JSON.stringify(
          operand,
        )}`,
    );
  }

  const comparisons: SimEventNumericComparison[] = [];

  for (let index = 0; index < written.length; index += 2) {
    const [comparator, against] = written.slice(index, index + 2);

    comparisons.push(SimEventNumericComparison.of(comparator, against));
  }

  return comparisons;
}

/**
 * `{"numeric": [">", 100]}`, and `{"numeric": [">", 0, "<=", 100]}` for a
 * range.
 *
 * Only a JSON number is compared numerically, so a string of digits in an
 * event matches nothing here, as it matches nothing on real AWS.
 */
export class SimEventNumericMatch extends SimEventPatternMatch {
  private readonly comparisons: readonly SimEventNumericComparison[];

  constructor(comparisons: readonly SimEventNumericComparison[]) {
    super();
    this.comparisons = comparisons;
  }

  /**
   * Read the comparisons a numeric condition is written as.
   */
  static of(operand: JSONValue): SimEventNumericMatch {
    return new this(comparisonsIn(operand));
  }

  /**
   * Whether the value is a number every comparison holds for.
   */
  matchesValue(value: unknown): boolean {
    if (typeof value !== "number") {
      return false;
    }

    return this.comparisons.every((comparison) => comparison.holds(value));
  }
}

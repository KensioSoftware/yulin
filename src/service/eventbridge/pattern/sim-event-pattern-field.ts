import { isRecord } from "../../../util/type-guard/record.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import type { SimEventPatternMatch } from "./match/sim-event-pattern-match.js";
import { SimEventExactMatch } from "./match/sim-event-exact-match.js";
import { eventPatternRefusal } from "./sim-event-pattern-refusals.js";
import { readPatternCondition } from "./sim-event-pattern-operators.js";

/**
 * Read one entry of a pattern's condition list.
 *
 * A plain value is an exact comparison, and an object is a condition written
 * with an operator. A list inside the list is neither.
 */
function readCondition(written: JSONValue): SimEventPatternMatch {
  if (isRecord(written)) {
    return readPatternCondition(written);
  }

  if (Array.isArray(written)) {
    throw eventPatternRefusal(
      "a match condition is a value or an operator object, and this one is a " +
        "list",
    );
  }

  return new SimEventExactMatch(written);
}

/**
 * The conditions a pattern puts on one field.
 *
 * A field is written as a list, and it matches when any one of the conditions
 * does, which is how a pattern says "or". Two fields in the same object both
 * have to match, which is how it says "and".
 */
export class SimEventPatternField {
  private readonly conditions: readonly SimEventPatternMatch[];

  private constructor(conditions: readonly SimEventPatternMatch[]) {
    this.conditions = conditions;
  }

  /**
   * Read the condition list written for one field.
   */
  static of(written: readonly JSONValue[], key: string): SimEventPatternField {
    if (written.length === 0) {
      throw eventPatternRefusal(
        `${key} is written with an empty list, and a field takes at least ` +
          `one match condition`,
      );
    }

    return new this(written.map(readCondition));
  }

  /**
   * Whether the value an event carries for this field satisfies any condition.
   *
   * A field the event carries a list for matches when the two lists overlap:
   * any member satisfying any condition is enough. That is how a pattern
   * naming one ARN matches an event whose `resources` names several.
   */
  matches(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.some((member: unknown) => this.matchesValue(member));
    }

    return this.matchesValue(value);
  }

  /**
   * Whether any condition holds for a field the event does not have.
   */
  matchesAbsent(): boolean {
    return this.conditions.some((condition) => condition.matchesAbsent());
  }

  private matchesValue(value: unknown): boolean {
    return this.conditions.some((condition) => condition.matchesValue(value));
  }
}

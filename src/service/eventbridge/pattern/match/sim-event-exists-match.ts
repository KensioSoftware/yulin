import type { JSONValue } from "../../../../util/type-guard/json.js";
import { eventPatternRefusal } from "../sim-event-pattern-refusals.js";
import { SimEventPatternMatch } from "./sim-event-pattern-match.js";

/**
 * The operator name real EventBridge gives this match.
 */
export const eventPatternExistsOperator = "exists";

/**
 * `{"exists": true}` and `{"exists": false}`.
 *
 * This is the one condition with anything to say about a field the event does
 * not have, which is the whole of what it is for. It works on leaf nodes: a
 * pattern asking whether an intermediate object exists is asking something
 * real EventBridge does not answer.
 */
export class SimEventExistsMatch extends SimEventPatternMatch {
  /**
   * This condition is about the field being there, not about its value.
   */
  public override readonly isAboutPresence: boolean = true;

  private readonly expected: boolean;

  constructor(expected: boolean) {
    super();
    this.expected = expected;
  }

  /**
   * Read an `exists` condition, which takes a boolean and nothing else.
   */
  static of(operand: JSONValue): SimEventExistsMatch {
    if (typeof operand !== "boolean") {
      throw eventPatternRefusal(
        `${eventPatternExistsOperator} match takes true or false, and this ` +
          `one takes ${JSON.stringify(operand)}`,
      );
    }

    return new this(operand);
  }

  /**
   * Whether the field being there is what the condition asked for.
   */
  matchesValue(): boolean {
    return this.expected;
  }

  /**
   * Whether the field being absent is what the condition asked for.
   */
  override matchesAbsent(): boolean {
    return !this.expected;
  }
}

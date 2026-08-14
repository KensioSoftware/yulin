import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  eventPatternAnythingButOperator,
  SimEventAnythingButMatch,
} from "./match/sim-event-anything-but-match.js";
import {
  eventPatternPrefixOperator,
  eventPatternSuffixOperator,
  SimEventAffixMatch,
} from "./match/sim-event-affix-match.js";
import {
  eventPatternExistsOperator,
  SimEventExistsMatch,
} from "./match/sim-event-exists-match.js";
import {
  eventPatternNumericOperator,
  SimEventNumericMatch,
} from "./match/sim-event-numeric-match.js";
import type { SimEventPatternMatch } from "./match/sim-event-pattern-match.js";
import {
  eventPatternRefusal,
  unsimulatedOperatorRefusal,
} from "./sim-event-pattern-refusals.js";

/**
 * How each operator reads the operand it was written with.
 */
type SimEventPatternOperatorReader = (
  operand: JSONValue,
) => SimEventPatternMatch;

/**
 * Every operator a condition can be written with here.
 */
const operators: ReadonlyMap<string, SimEventPatternOperatorReader> = new Map<
  string,
  SimEventPatternOperatorReader
>([
  [
    eventPatternPrefixOperator,
    (operand): SimEventPatternMatch => SimEventAffixMatch.prefix(operand),
  ],
  [
    eventPatternSuffixOperator,
    (operand): SimEventPatternMatch => SimEventAffixMatch.suffix(operand),
  ],
  [
    eventPatternAnythingButOperator,
    (operand): SimEventPatternMatch => SimEventAnythingButMatch.of(operand),
  ],
  [
    eventPatternNumericOperator,
    (operand): SimEventPatternMatch => SimEventNumericMatch.of(operand),
  ],
  [
    eventPatternExistsOperator,
    (operand): SimEventPatternMatch => SimEventExistsMatch.of(operand),
  ],
]);

/**
 * The operators real EventBridge has that this simulation does not evaluate.
 *
 * Held by name so a pattern using one is refused with the name in the message,
 * rather than refused as an unrecognised condition. Which of the two a reader
 * gets tells them whether they mistyped an operator or reached for one that is
 * not here yet.
 */
const unsimulatedOperators = new Set([
  "cidr",
  "equals-ignore-case",
  "wildcard",
  "$or",
]);

/**
 * Read the one operator a condition object is written with.
 *
 * A condition is a single-key object, such as `{"prefix": "us-"}`. Two keys is
 * not a condition real EventBridge has, so it is refused rather than one of
 * them being picked.
 */
export function readPatternCondition(
  condition: Record<string, JSONValue>,
): SimEventPatternMatch {
  const written = Object.entries(condition);
  const [only] = written;

  if (only === undefined || written.length !== 1) {
    throw eventPatternRefusal(
      `a match condition is written with one operator, and this one is ` +
        `written with ${String(written.length)}`,
    );
  }

  const [name, operand] = only;

  if (unsimulatedOperators.has(name)) {
    throw unsimulatedOperatorRefusal(name);
  }

  const read = operators.get(name);

  if (read === undefined) {
    throw eventPatternRefusal(
      `${name} is not an operator EventBridge event patterns have`,
    );
  }

  return read(operand);
}

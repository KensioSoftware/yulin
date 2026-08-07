import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  SimSnsAnythingButMatch,
  simSnsAnythingButOperator,
} from "./match/sim-sns-anything-but-match.js";
import {
  SimSnsEqualsIgnoreCaseMatch,
  simSnsEqualsIgnoreCaseOperator,
} from "./match/sim-sns-equals-ignore-case-match.js";
import {
  SimSnsExistsMatch,
  simSnsExistsOperator,
} from "./match/sim-sns-exists-match.js";
import type { SimSnsFilterMatch } from "./match/sim-sns-filter-match.js";
import {
  SimSnsNumericMatch,
  simSnsNumericOperator,
} from "./match/sim-sns-numeric-match.js";
import {
  SimSnsPrefixMatch,
  simSnsPrefixOperator,
} from "./match/sim-sns-prefix-match.js";
import {
  SimSnsSuffixMatch,
  simSnsSuffixOperator,
} from "./match/sim-sns-suffix-match.js";

/**
 * How each operator reads the operand it was written with.
 */
export type SimSnsFilterOperatorReader = (
  operand: JSONValue,
) => SimSnsFilterMatch;

/**
 * Every operator a match condition can be written with.
 *
 * The one real SNS has that is missing here is `cidr`, which is refused by name
 * rather than left out quietly.
 */
export const simSnsFilterOperators: ReadonlyMap<
  string,
  SimSnsFilterOperatorReader
> = new Map<string, SimSnsFilterOperatorReader>([
  [
    simSnsPrefixOperator,
    (operand): SimSnsFilterMatch => SimSnsPrefixMatch.of(operand),
  ],
  [
    simSnsSuffixOperator,
    (operand): SimSnsFilterMatch => SimSnsSuffixMatch.of(operand),
  ],
  [
    simSnsEqualsIgnoreCaseOperator,
    (operand): SimSnsFilterMatch => SimSnsEqualsIgnoreCaseMatch.of(operand),
  ],
  [
    simSnsNumericOperator,
    (operand): SimSnsFilterMatch => SimSnsNumericMatch.of(operand),
  ],
  [
    simSnsExistsOperator,
    (operand): SimSnsFilterMatch => SimSnsExistsMatch.of(operand),
  ],
  [
    simSnsAnythingButOperator,
    (operand): SimSnsFilterMatch => SimSnsAnythingButMatch.of(operand),
  ],
]);

/**
 * The names real SNS reserves, which a policy cannot use as a key.
 *
 * These are the operator names. An `$or` alternative naming one of them is not
 * read as an alternative by real SNS, which is the rule that decides whether a
 * policy is an or at all.
 */
export const simSnsFilterReservedNames: ReadonlySet<string> = new Set([
  ...simSnsFilterOperators.keys(),
  "cidr",
]);

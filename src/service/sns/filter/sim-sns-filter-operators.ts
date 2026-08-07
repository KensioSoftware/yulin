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
export const simSnsFilterOperators = new Map<
  string,
  SimSnsFilterOperatorReader
>([
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

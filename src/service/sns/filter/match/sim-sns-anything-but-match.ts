import type { JSONValue } from "../../../../util/type-guard/json.js";
import {
  filterPolicyOperator,
  isFilterPolicyObject,
  simSnsFilterPolicyRefusal,
} from "../sim-sns-filter-refusals.js";
import type { SimSnsFilterValue } from "../sim-sns-filter-value.js";
import {
  SimSnsEqualsIgnoreCaseMatch,
  simSnsEqualsIgnoreCaseOperator,
} from "./sim-sns-equals-ignore-case-match.js";
import { SimSnsExactMatch } from "./sim-sns-exact-match.js";
import { SimSnsFilterMatch } from "./sim-sns-filter-match.js";
import {
  SimSnsPrefixMatch,
  simSnsPrefixOperator,
} from "./sim-sns-prefix-match.js";
import {
  SimSnsSuffixMatch,
  simSnsSuffixOperator,
} from "./sim-sns-suffix-match.js";

/**
 * The operator name real SNS gives this match.
 */
export const simSnsAnythingButOperator = "anything-but";

/**
 * The operators real SNS lets a policy write inside `anything-but`.
 *
 * These are the string matches, which is what excluding by shape rather than by
 * value needs. `numeric` and `exists` are not among them, and neither is a
 * second `anything-but`.
 */
const excludable = new Map<string, (operand: JSONValue) => SimSnsFilterMatch>([
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
]);

/**
 * Read what an `anything-but` excludes, whichever form it was written in.
 *
 * A scalar excludes one value, a list excludes each of them, and an object
 * excludes whatever the operator inside it would have matched.
 */
function excluded(operand: JSONValue): readonly SimSnsFilterMatch[] {
  if (Array.isArray(operand)) {
    return operand.map((written) => SimSnsExactMatch.of(written));
  }

  if (!isFilterPolicyObject(operand)) {
    return [SimSnsExactMatch.of(operand)];
  }

  const { name, operand: excludes } = filterPolicyOperator(operand);
  const inner = excludable.get(name);

  if (inner === undefined) {
    throw simSnsFilterPolicyRefusal(
      `anything-but takes a value, a list of values, or a prefix, suffix or ` +
        `equals-ignore-case match, and this one takes ${name}`,
    );
  }

  return [inner(excludes)];
}

/**
 * `{"anything-but": "order"}`, which matches every value but the ones it names.
 *
 * It is the negation of whatever it holds rather than an operator of its own,
 * so `{"anything-but": {"prefix": "order-"}}` excludes on the start of the
 * value the way `prefix` includes on it.
 *
 * A key the message does not carry still matches nothing. Real SNS asks about a
 * value it has, and there is no value here to be anything but the excluded one.
 */
export class SimSnsAnythingButMatch extends SimSnsFilterMatch {
  private readonly excluded: readonly SimSnsFilterMatch[];

  constructor(excludedMatches: readonly SimSnsFilterMatch[]) {
    super();
    this.excluded = excludedMatches;
  }

  /**
   * Read what an `anything-but` excludes.
   */
  static of(operand: JSONValue): SimSnsAnythingButMatch {
    return new this(excluded(operand));
  }

  /**
   * Whether the value is none of the excluded ones.
   */
  matchesValue(value: SimSnsFilterValue): boolean {
    return this.excluded.every((match) => !match.matchesValue(value));
  }
}

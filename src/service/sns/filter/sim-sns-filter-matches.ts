import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimSnsUnsimulatedInputException } from "../error/sim-sns.error.js";
import { SimSnsExactMatch } from "./match/sim-sns-exact-match.js";
import type { SimSnsFilterMatch } from "./match/sim-sns-filter-match.js";
import { simSnsFilterOperators } from "./sim-sns-filter-operators.js";
import {
  filterPolicyOperator,
  isFilterPolicyObject,
  simSnsFilterPolicyRefusal,
} from "./sim-sns-filter-refusals.js";

/**
 * The one operator real SNS has that this simulation does not.
 *
 * IP range matching is refused when the policy is set rather than accepted and
 * then matching nothing, because a subscription that filtered everything out
 * would look like a policy nothing happened to match.
 */
const simSnsCidrOperator = "cidr";

/**
 * Refuse an operator this simulation cannot apply, naming it.
 */
function unknownOperator(name: string): Error {
  if (name === simSnsCidrOperator) {
    return new SimSnsUnsimulatedInputException(
      `The filter policy operator ${simSnsCidrOperator} is not simulated. IP ` +
        `range matching is refused when the policy is set, because a policy ` +
        `holding it would match nothing and look like filtering that worked.`,
    );
  }

  return simSnsFilterPolicyRefusal(`${name} is not a match operator`);
}

/**
 * Read one entry of the list a policy key holds.
 *
 * An object is an operator, and anything else is a value to match exactly.
 */
export function simSnsFilterMatchOf(written: JSONValue): SimSnsFilterMatch {
  if (!isFilterPolicyObject(written)) {
    return SimSnsExactMatch.of(written);
  }

  const { name, operand } = filterPolicyOperator(written);
  const operator = simSnsFilterOperators.get(name);

  if (operator === undefined) {
    throw unknownOperator(name);
  }

  return operator(operand);
}

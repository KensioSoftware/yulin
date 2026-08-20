import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";

/**
 * Refuse something in a rule that real WAFv2 takes and this simulation does
 * not.
 *
 * Every refusal names the rule and what in it was refused, because a web ACL
 * is a list of rules that all look alike from the outside and the name is the
 * only thing that says which one to go and look at.
 */
export function refuseSimWafRuleInput(
  ruleName: string,
  refused: string,
  reason: string,
): never {
  throw new SimWafUnsimulatedInputException(
    `Rule ${ruleName} uses ${refused}, which Yulin does not simulate: ` +
      `${reason}. A web ACL that accepted a rule it cannot evaluate would ` +
      `allow a request AWS blocks.`,
  );
}

/**
 * Refuse a rule real WAFv2 would refuse too.
 */
export function invalidSimWafRule(ruleName: string, reason: string): never {
  throw new SimWafInvalidParameterException(
    `Error reason: ${reason}, field: RULE, parameter: ${ruleName}`,
  );
}

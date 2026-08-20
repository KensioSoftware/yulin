import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "../statement/sim-waf-rule-refusals.js";
import type { SimWafRuleInput } from "./sim-waf-rule.type.js";

const browserAnswered =
  "the two actions they configure are answered by a browser, and nothing in " +
  "a test does that";

/**
 * The rule members real WAFv2 takes and this simulation does not.
 */
const refusedMembers = new Map<string, string>([
  [
    "OverrideAction",
    "it only applies to a rule group statement, and no rule group is simulated",
  ],
  [
    "RuleLabels",
    "nothing here reads a label, since LabelMatchStatement arrives with the " +
      "AWS managed rule groups",
  ],
  ["CaptchaConfig", browserAnswered],
  ["ChallengeConfig", browserAnswered],
]);

/**
 * Read the name a rule was written under, refusing one with none.
 */
export function requiredSimWafRuleName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimWafInvalidParameterException(
      "Error reason: A rule needs a Name, field: RULE, parameter: Name",
    );
  }

  return name;
}

/**
 * Read the priority a rule runs at, refusing anything that is not a place in
 * an order.
 */
export function requiredSimWafRulePriority(
  priority: number | undefined,
  name: string,
): number {
  if (
    priority === undefined ||
    !Number.isSafeInteger(priority) ||
    priority < 0
  ) {
    invalidSimWafRule(name, "A rule needs a Priority of zero or more");
  }

  return priority;
}

/**
 * Refuse the parts of a rule real WAFv2 takes and this simulation does not.
 */
export function refuseUnsimulatedSimWafRuleInput(
  input: SimWafRuleInput,
  name: string,
): void {
  for (const [member, value] of Object.entries(input)) {
    const reason = refusedMembers.get(member);

    if (reason !== undefined && value !== undefined) {
      refuseSimWafRuleInput(name, member, reason);
    }
  }
}

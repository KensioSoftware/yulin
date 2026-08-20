import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafMatcher } from "../statement/sim-waf-field-match.js";
import { compileSimWafStatement } from "../statement/sim-waf-statement.js";
import { SimWafAction } from "./sim-waf-action.js";
import {
  refuseUnsimulatedSimWafRuleInput,
  requiredSimWafRuleName,
  requiredSimWafRulePriority,
} from "./sim-waf-rule-input.js";
import type { SimWafRuleInput, SimWafRuleScope } from "./sim-waf-rule.type.js";

interface SimWafRuleProperties {
  readonly name: string;
  readonly priority: number;
  readonly action: SimWafAction;
  readonly matcher: SimWafMatcher;
}

/**
 * One rule of a web ACL, compiled so a request can be evaluated against it.
 *
 * The statement is turned into a matcher when the web ACL is written, which is
 * what lets a rule Yulin cannot evaluate be refused at that point rather than
 * silently letting requests past later on.
 */
export class SimWafRule {
  public readonly name: string;
  public readonly priority: number;
  public readonly action: SimWafAction;

  readonly #matcher: SimWafMatcher;

  private constructor(properties: SimWafRuleProperties) {
    this.name = properties.name;
    this.priority = properties.priority;
    this.action = properties.action;
    this.#matcher = properties.matcher;
  }

  /**
   * Compile one rule as it was written.
   */
  static compile(input: SimWafRuleInput, scope: SimWafRuleScope): SimWafRule {
    const name = requiredSimWafRuleName(input.Name);

    refuseUnsimulatedSimWafRuleInput(input, name);

    return new SimWafRule({
      name,
      priority: requiredSimWafRulePriority(input.Priority, name),
      action: SimWafAction.read(input.Action, name, scope.customResponseBodies),
      matcher: compileSimWafStatement(input.Statement, {
        regexPatternSets: scope.regexPatternSets,
        ruleName: name,
      }),
    });
  }

  /**
   * Whether this rule claims a request.
   */
  matches(request: SimWafInspectedRequest): boolean {
    return this.#matcher(request);
  }
}

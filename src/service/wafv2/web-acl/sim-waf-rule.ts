import { SimWafUnsimulatedInputException } from "../error/sim-wafv2.error.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafAction } from "./sim-waf-action.js";
import {
  refuseUnsimulatedSimWafRuleInput,
  requiredSimWafRuleName,
  requiredSimWafRulePriority,
} from "./sim-waf-rule-input.js";
import { simWafRuleLabels } from "./sim-waf-rule-labels.js";
import { compileSimWafRuleEvaluator } from "./sim-waf-rule-evaluator.js";
import type {
  SimWafRuleEvaluator,
  SimWafRuleInput,
  SimWafRuleScope,
} from "./sim-waf-rule.type.js";

interface SimWafRuleProperties {
  readonly name: string;
  readonly priority: number;
  readonly labels: readonly string[];
  readonly evaluate: SimWafRuleEvaluator;
  readonly unsimulatedReason?: string | undefined;
}

/**
 * What a rule held without being evaluated does with every request.
 */
function claimsNothing(): undefined {
  // A held rule claims no request, so every request goes on to the next rule.
}

/**
 * One rule of a web ACL, compiled so a request can be evaluated against it.
 *
 * The statement is turned into an evaluator when the web ACL is written. A
 * rule using something Yulin does not simulate is held all the same, as a
 * rule that claims no request, and says why in `unsimulatedReason`. The web
 * ACL reports it from there.
 */
export class SimWafRule {
  public readonly name: string;
  public readonly priority: number;

  /**
   * Why this rule claims no request, when it uses something Yulin does not
   * simulate.
   *
   * AWS would evaluate it. A request it would have claimed goes on to the
   * next rule here.
   */
  public readonly unsimulatedReason: string | undefined;

  readonly #labels: readonly string[];
  readonly #evaluate: SimWafRuleEvaluator;

  private constructor(properties: SimWafRuleProperties) {
    this.name = properties.name;
    this.priority = properties.priority;
    this.#labels = properties.labels;
    this.#evaluate = properties.evaluate;
    this.unsimulatedReason = properties.unsimulatedReason;
  }

  /**
   * Compile one rule as it was written.
   *
   * Input WAFv2 itself would refuse is refused here too. A rule using
   * something only Yulin leaves out compiles to one that claims nothing.
   */
  static compile(input: SimWafRuleInput, scope: SimWafRuleScope): SimWafRule {
    const name = requiredSimWafRuleName(input.Name);
    const priority = requiredSimWafRulePriority(input.Priority, name);
    const labels = simWafRuleLabels(input.RuleLabels, name);

    try {
      refuseUnsimulatedSimWafRuleInput(input, name);

      return new SimWafRule({
        name,
        priority,
        labels,
        evaluate: compileSimWafRuleEvaluator(input, name, scope),
      });
    } catch (error) {
      if (!(error instanceof SimWafUnsimulatedInputException)) {
        throw error;
      }

      return new SimWafRule({
        name,
        priority,
        labels,
        evaluate: claimsNothing,
        unsimulatedReason: error.message,
      });
    }
  }

  /**
   * What this rule does with a request, which is nothing when it does not
   * claim it.
   *
   * A rule labels the requests it claims whatever action it goes on to take,
   * counted ones included, because a label is how a rule that runs later finds
   * out this one matched.
   */
  evaluate(request: SimWafInspectedRequest): SimWafAction | undefined {
    const action = this.#evaluate(request);

    if (action !== undefined) {
      for (const label of this.#labels) {
        request.labels.add(label);
      }
    }

    return action;
  }
}

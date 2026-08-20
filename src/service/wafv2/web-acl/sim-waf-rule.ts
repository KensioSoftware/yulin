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
}

/**
 * One rule of a web ACL, compiled so a request can be evaluated against it.
 *
 * The statement is turned into an evaluator when the web ACL is written, which
 * is what lets a rule Yulin cannot evaluate be refused at that point rather
 * than silently letting requests past later on.
 */
export class SimWafRule {
  public readonly name: string;
  public readonly priority: number;

  readonly #labels: readonly string[];
  readonly #evaluate: SimWafRuleEvaluator;

  private constructor(properties: SimWafRuleProperties) {
    this.name = properties.name;
    this.priority = properties.priority;
    this.#labels = properties.labels;
    this.#evaluate = properties.evaluate;
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
      labels: simWafRuleLabels(input.RuleLabels, name),
      evaluate: compileSimWafRuleEvaluator(input, name, scope),
    });
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

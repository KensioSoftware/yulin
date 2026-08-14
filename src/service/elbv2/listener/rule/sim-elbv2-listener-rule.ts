import type { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import type { SimElbV2ActionView } from "../../command/sim-elbv2-shared.command.js";
import type { SimElbV2Listener } from "../sim-elbv2-listener.js";
import type { SimElbV2RuleConditionInput } from "../../command/rule/rule-condition.command.js";
import type { SimElbV2RuleCondition } from "./sim-elbv2-rule-condition.js";

interface SimElbV2ListenerRuleProperties {
  readonly listenerArn: string;
  readonly id: string;
  readonly priority: number;
  readonly conditions: readonly SimElbV2RuleCondition[];
  readonly actions: readonly SimElbV2Action[];
}

/**
 * What a request can change on an existing rule.
 */
export interface SimElbV2ListenerRuleChanges {
  readonly conditions?: readonly SimElbV2RuleCondition[] | undefined;
  readonly actions?: readonly SimElbV2Action[] | undefined;
}

/**
 * A simulated listener rule as the SDK reads it back.
 *
 * `Priority` is a string here rather than a number, which is how real ELB
 * reports it, because the default rule reports the word `default` in the same
 * field.
 */
export interface SimElbV2ListenerRuleView {
  readonly RuleArn: string;
  readonly Priority: string;
  readonly Conditions: readonly SimElbV2RuleConditionInput[];
  readonly Actions: readonly SimElbV2ActionView[];
  readonly IsDefault: boolean;
}

/**
 * One simulated rule on a listener.
 *
 * A rule's ARN is built from its listener's, so it names the load balancer,
 * the listener and the rule the way real ELB does, and nothing has to look a
 * parent up to work out where a rule belongs.
 */
export class SimElbV2ListenerRule {
  public readonly arn: string;
  public readonly listenerArn: string;

  private currentPriority: number;
  private currentConditions: readonly SimElbV2RuleCondition[];
  private currentActions: readonly SimElbV2Action[];

  constructor(properties: SimElbV2ListenerRuleProperties) {
    this.listenerArn = properties.listenerArn;
    this.arn = `${properties.listenerArn.replace(
      ":listener/",
      ":listener-rule/",
    )}/${properties.id}`;
    this.currentPriority = properties.priority;
    this.currentConditions = properties.conditions;
    this.currentActions = properties.actions;
  }

  /** Where this rule sits in the order its listener evaluates rules in. */
  get priority(): number {
    return this.currentPriority;
  }

  /** What a request has to satisfy for this rule to claim it. */
  get conditions(): readonly SimElbV2RuleCondition[] {
    return this.currentConditions;
  }

  /** What this rule does with a request it claims. */
  get actions(): readonly SimElbV2Action[] {
    return this.currentActions;
  }

  /**
   * Move this rule to another priority.
   *
   * Real ELB keeps this apart from `ModifyRule`, which cannot change a
   * priority, because moving rules about is a reordering of the whole listener
   * rather than a change to one rule.
   */
  reprioritize(priority: number): void {
    this.currentPriority = priority;
  }

  /**
   * Change the conditions or actions a request names, leaving the rest.
   */
  modify(changes: SimElbV2ListenerRuleChanges): void {
    this.currentConditions = changes.conditions ?? this.currentConditions;
    this.currentActions = changes.actions ?? this.currentActions;
  }

  /**
   * Report this rule in the shape the SDK reads it back in.
   */
  view(): SimElbV2ListenerRuleView {
    return {
      RuleArn: this.arn,
      Priority: String(this.priority),
      Conditions: this.conditions.map((condition) => condition.view()),
      Actions: this.actions.map((action) => action.view()),
      IsDefault: false,
    };
  }
}

/**
 * A listener's default actions, reported as the rule real ELB reports them as.
 *
 * Real `DescribeRules` answers with the default rule last, priority `default`,
 * and a stack that reads the rules on a listener expects to find it. It is not
 * a stored rule, because it is the listener: changing the listener's default
 * actions changes it.
 */
export function simElbV2DefaultRuleView(
  listener: SimElbV2Listener,
): SimElbV2ListenerRuleView {
  return {
    RuleArn: `${listener.arn.replace(":listener/", ":listener-rule/")}/default`,
    Priority: "default",
    Conditions: [],
    Actions: listener.defaultActions.map((action) => action.view()),
    IsDefault: true,
  };
}

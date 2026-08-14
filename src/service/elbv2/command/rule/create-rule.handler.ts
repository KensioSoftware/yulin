import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import type { SimElbV2ActionTargets } from "../../action/sim-elbv2-action-targets.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2ListenerRule } from "../../listener/rule/sim-elbv2-listener-rule.js";
import { SimElbV2RuleCondition } from "../../listener/rule/sim-elbv2-rule-condition.js";
import { simElbV2RulePriority } from "../../listener/rule/sim-elbv2-rule-priority.js";
import { simElbV2ResourceId } from "../../sim-elbv2-resource-id.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimCreateRuleCommand,
  SimCreateRuleCommandOutput,
} from "./rule.command.js";

interface CreateRuleCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly actionTargets: SimElbV2ActionTargets;
}

/**
 * Simulated ELBv2 CreateRuleCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateRule.html
 */
export class CreateRuleCommandHandler
  extends SimElbV2CommandHandler
  implements CommandHandler<SimCreateRuleCommand, SimCreateRuleCommandOutput>
{
  private readonly actionTargets: SimElbV2ActionTargets;

  constructor(properties: CreateRuleCommandHandlerProperties) {
    super(properties);
    this.actionTargets = properties.actionTargets;
  }

  /**
   * Create a rule on a listener at a priority no other rule holds.
   *
   * Priority is what decides which of several matching rules claims a request,
   * so two rules sharing one would leave the outcome undefined. Real ELB
   * refuses the second, and so does this.
   */
  async handle(
    command: SimCreateRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimCreateRuleCommandOutput> {
    const { input } = command;

    if (input.ListenerArn === undefined) {
      throw new SimElbV2ValidationError("ListenerArn is required");
    }

    const priority = simElbV2RulePriority(input.Priority);
    const conditions = SimElbV2RuleCondition.readAll(input.Conditions);
    const actions = SimElbV2Action.readAll(input.Actions, "Actions");

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("CreateRule", input.ListenerArn, options);

    const listener = this.stores.listeners.requireByArn(input.ListenerArn);

    this.actionTargets.requireTargetGroups(actions);
    this.stores.rules.requirePriorityAvailable(listener.arn, priority);

    const rule = new SimElbV2ListenerRule({
      listenerArn: listener.arn,
      id: simElbV2ResourceId(this.stores.rules.nextSequence()),
      priority,
      conditions,
      actions,
    });

    this.stores.rules.put(rule);

    return { $metadata: {}, Rules: [rule.view()] };
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import type { SimElbV2ActionTargets } from "../../action/sim-elbv2-action-targets.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2ListenerRuleChanges } from "../../listener/rule/sim-elbv2-listener-rule.js";
import { SimElbV2RuleCondition } from "../../listener/rule/sim-elbv2-rule-condition.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimModifyRuleCommand,
  SimModifyRuleCommandInput,
  SimModifyRuleCommandOutput,
} from "./rule.command.js";

interface ModifyRuleCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly actionTargets: SimElbV2ActionTargets;
}

/**
 * Simulated ELBv2 ModifyRuleCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_ModifyRule.html
 */
export class ModifyRuleCommandHandler
  extends SimElbV2CommandHandler
  implements CommandHandler<SimModifyRuleCommand, SimModifyRuleCommandOutput>
{
  private readonly actionTargets: SimElbV2ActionTargets;

  constructor(properties: ModifyRuleCommandHandlerProperties) {
    super(properties);
    this.actionTargets = properties.actionTargets;
  }

  private static readChanges(
    input: SimModifyRuleCommandInput,
  ): SimElbV2ListenerRuleChanges {
    return {
      conditions:
        input.Conditions === undefined
          ? undefined
          : SimElbV2RuleCondition.readAll(input.Conditions),
      actions:
        input.Actions === undefined
          ? undefined
          : SimElbV2Action.readAll(input.Actions, "Actions"),
    };
  }

  /**
   * Change the conditions or actions of a rule.
   *
   * A priority cannot be changed here, as it cannot on real ELB, because where
   * a rule sits is a property of its listener's whole order rather than of the
   * rule. `SetRulePriorities` is where that happens.
   */
  async handle(
    command: SimModifyRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimModifyRuleCommandOutput> {
    const { input } = command;

    if (input.RuleArn === undefined) {
      throw new SimElbV2ValidationError("RuleArn is required");
    }

    const changes = ModifyRuleCommandHandler.readChanges(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("ModifyRule", input.RuleArn, options);

    const rule = this.stores.rules.requireByArn(input.RuleArn);

    this.actionTargets.requireTargetGroups(changes.actions ?? []);
    rule.modify(changes);

    return { $metadata: {}, Rules: [rule.view()] };
  }
}

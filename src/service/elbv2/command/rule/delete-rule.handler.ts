import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDeleteRuleCommand,
  SimDeleteRuleCommandOutput,
} from "./rule.command.js";

/**
 * Simulated ELBv2 DeleteRuleCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DeleteRule.html
 */
export class DeleteRuleCommandHandler
  extends SimElbV2CommandHandler
  implements CommandHandler<SimDeleteRuleCommand, SimDeleteRuleCommandOutput>
{
  /**
   * Delete a rule, freeing the priority it held on its listener.
   */
  async handle(
    command: SimDeleteRuleCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDeleteRuleCommandOutput> {
    const ruleArn = command.input.RuleArn;

    if (ruleArn === undefined) {
      throw new SimElbV2ValidationError("RuleArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("DeleteRule", ruleArn, options);

    this.stores.rules.remove(this.stores.rules.requireByArn(ruleArn));

    return { $metadata: {} };
  }
}

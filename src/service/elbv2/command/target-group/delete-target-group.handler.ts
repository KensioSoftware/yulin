import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2TargetGroupUsage } from "../../target-group/sim-elbv2-target-group-usage.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDeleteTargetGroupCommand,
  SimDeleteTargetGroupCommandOutput,
} from "./target-group.command.js";

interface DeleteTargetGroupCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly usage: SimElbV2TargetGroupUsage;
}

/**
 * Simulated ELBv2 DeleteTargetGroupCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DeleteTargetGroup.html
 */
export class DeleteTargetGroupCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDeleteTargetGroupCommand,
      SimDeleteTargetGroupCommandOutput
    >
{
  private readonly usage: SimElbV2TargetGroupUsage;

  constructor(properties: DeleteTargetGroupCommandHandlerProperties) {
    super(properties);
    this.usage = properties.usage;
  }

  /**
   * Delete a target group nothing forwards to any more.
   *
   * Real ELB refuses while a listener or rule still names it, which is what
   * makes deleting a load balancer first the way to get rid of both.
   */
  async handle(
    command: SimDeleteTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDeleteTargetGroupCommandOutput> {
    const targetGroupArn = command.input.TargetGroupArn;

    if (targetGroupArn === undefined) {
      throw new SimElbV2ValidationError("TargetGroupArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("DeleteTargetGroup", targetGroupArn, options);

    const targetGroup = this.stores.targetGroups.requireByArn(targetGroupArn);

    this.usage.requireUnused(targetGroup);
    this.stores.targetGroups.remove(targetGroup);

    return { $metadata: {} };
  }
}

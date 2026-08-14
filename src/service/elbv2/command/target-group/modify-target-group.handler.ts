import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2TargetGroupUsage } from "../../target-group/sim-elbv2-target-group-usage.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimModifyTargetGroupCommand,
  SimModifyTargetGroupCommandOutput,
} from "./target-group.command.js";

interface ModifyTargetGroupCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly usage: SimElbV2TargetGroupUsage;
}

/**
 * Simulated ELBv2 ModifyTargetGroupCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_ModifyTargetGroup.html
 */
export class ModifyTargetGroupCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimModifyTargetGroupCommand,
      SimModifyTargetGroupCommandOutput
    >
{
  private readonly usage: SimElbV2TargetGroupUsage;

  constructor(properties: ModifyTargetGroupCommandHandlerProperties) {
    super(properties);
    this.usage = properties.usage;
  }

  /**
   * Change the health check settings of a target group.
   *
   * The settings are stored and reported and nothing acts on them: no request
   * is ever made to a target to find out whether it is up. A stack still
   * declares them, so a test comparing what it deployed against what it meant
   * to deploy can read them back.
   */
  async handle(
    command: SimModifyTargetGroupCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimModifyTargetGroupCommandOutput> {
    const { input } = command;

    if (input.TargetGroupArn === undefined) {
      throw new SimElbV2ValidationError("TargetGroupArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(
      "ModifyTargetGroup",
      input.TargetGroupArn,
      options,
    );

    const targetGroup = this.stores.targetGroups.requireByArn(
      input.TargetGroupArn,
    );

    targetGroup.modifyHealthCheck(input);

    return {
      $metadata: {},
      TargetGroups: [
        targetGroup.view(this.usage.loadBalancerArns(targetGroup)),
      ],
    };
  }
}

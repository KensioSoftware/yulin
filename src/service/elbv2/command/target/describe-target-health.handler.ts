import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  SimElbV2InvalidTargetException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import { SimElbV2Target } from "../../target-group/sim-elbv2-target.js";
import type { SimElbV2TargetGroup } from "../../target-group/sim-elbv2-target-group.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDescribeTargetHealthCommand,
  SimDescribeTargetHealthCommandInput,
  SimDescribeTargetHealthCommandOutput,
} from "./target.command.js";

/**
 * Simulated ELBv2 DescribeTargetHealthCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeTargetHealth.html
 */
export class DescribeTargetHealthCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDescribeTargetHealthCommand,
      SimDescribeTargetHealthCommandOutput
    >
{
  /**
   * The targets a request asks about, refusing one that is not registered.
   *
   * Real ELB answers `InvalidTarget` for a target the group does not hold,
   * rather than leaving it out of the answer, so a test asking about the wrong
   * target hears about it.
   */
  private static selected(
    targetGroup: SimElbV2TargetGroup,
    input: SimDescribeTargetHealthCommandInput,
  ): readonly SimElbV2Target[] {
    if (input.Targets === undefined) {
      return targetGroup.registeredTargets;
    }

    return input.Targets.map((description) => {
      const asked = SimElbV2Target.read(description, targetGroup.port);
      const registered = targetGroup.registeredTargets.find(
        (target) => target.key === asked.key,
      );

      if (registered === undefined) {
        throw new SimElbV2InvalidTargetException(
          `Target '${asked.id}' is not registered in target group ${
            targetGroup.arn
          }`,
        );
      }

      return registered;
    });
  }

  /**
   * Report the targets registered in a target group.
   *
   * Every one of them is healthy, because nothing here ever asks a target
   * whether it is: no health check is performed, so there is no state for a
   * target to be in other than registered. This is therefore a way to read
   * back what `RegisterTargets` did rather than a way to watch a deployment
   * come up.
   */
  async handle(
    command: SimDescribeTargetHealthCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeTargetHealthCommandOutput> {
    const { input } = command;

    if (input.TargetGroupArn === undefined) {
      throw new SimElbV2ValidationError("TargetGroupArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(
      "DescribeTargetHealth",
      input.TargetGroupArn,
      options,
    );

    const targetGroup = this.stores.targetGroups.requireByArn(
      input.TargetGroupArn,
    );

    return {
      $metadata: {},
      TargetHealthDescriptions: DescribeTargetHealthCommandHandler.selected(
        targetGroup,
        input,
      ).map((target) => ({
        Target: target.view(),
        TargetHealth: { State: "healthy" },
      })),
    };
  }
}

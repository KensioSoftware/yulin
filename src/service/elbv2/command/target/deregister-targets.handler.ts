import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDeregisterTargetsCommand,
  SimDeregisterTargetsCommandOutput,
} from "./target.command.js";

/**
 * Simulated ELBv2 DeregisterTargetsCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DeregisterTargets.html
 */
export class DeregisterTargetsCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDeregisterTargetsCommand,
      SimDeregisterTargetsCommandOutput
    >
{
  /**
   * Take targets out of a target group.
   *
   * A target that was not in the group is not an error, as it is not on real
   * ELB: deregistering is stated as an end state rather than as a change.
   * Deregistration is also immediate here, where real ELB drains connections
   * for a few minutes first, because there are no connections to drain.
   */
  async handle(
    command: SimDeregisterTargetsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDeregisterTargetsCommandOutput> {
    const { TargetGroupArn: targetGroupArn, Targets: targets } = command.input;

    if (targetGroupArn === undefined) {
      throw new SimElbV2ValidationError("TargetGroupArn is required");
    }

    if (targets === undefined || targets.length === 0) {
      throw new SimElbV2ValidationError(
        "Targets must name at least one target",
      );
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("DeregisterTargets", targetGroupArn, options);

    this.stores.targetGroups.requireByArn(targetGroupArn).deregister(targets);

    return { $metadata: {} };
  }
}

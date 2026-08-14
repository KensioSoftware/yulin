import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimRegisterTargetsCommand,
  SimRegisterTargetsCommandOutput,
} from "./target.command.js";

/**
 * Simulated ELBv2 RegisterTargetsCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_RegisterTargets.html
 */
export class RegisterTargetsCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<SimRegisterTargetsCommand, SimRegisterTargetsCommandOutput>
{
  /**
   * Put targets into a target group.
   *
   * What a target may be is the target group's business rather than this
   * handler's, so a function ARN in an address group and an address in a
   * function group are both refused by the group's own type.
   */
  async handle(
    command: SimRegisterTargetsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimRegisterTargetsCommandOutput> {
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

    this.authorizer.authorize("RegisterTargets", targetGroupArn, options);

    this.stores.targetGroups.requireByArn(targetGroupArn).register(targets);

    return { $metadata: {} };
  }
}

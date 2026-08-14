import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimElbV2TargetGroupUsage } from "../../target-group/sim-elbv2-target-group-usage.js";
import { SimElbV2Page } from "../sim-elbv2-page.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import { SimElbV2TargetGroupSelection } from "./describe-target-groups-selection.js";
import type {
  SimDescribeTargetGroupsCommand,
  SimDescribeTargetGroupsCommandOutput,
} from "./target-group.command.js";

interface DescribeTargetGroupsCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly usage: SimElbV2TargetGroupUsage;
}

/**
 * Simulated ELBv2 DescribeTargetGroupsCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeTargetGroups.html
 */
export class DescribeTargetGroupsCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDescribeTargetGroupsCommand,
      SimDescribeTargetGroupsCommandOutput
    >
{
  private readonly usage: SimElbV2TargetGroupUsage;
  private readonly selection: SimElbV2TargetGroupSelection;

  constructor(properties: DescribeTargetGroupsCommandHandlerProperties) {
    super(properties);
    this.usage = properties.usage;
    this.selection = new SimElbV2TargetGroupSelection(properties);
  }

  /**
   * Describe the target groups a request names, or all of them.
   *
   * Narrowing by load balancer answers with the groups its listeners and rules
   * forward to, which is the same question the `LoadBalancerArns` on each
   * group answers from the other side.
   */
  async handle(
    command: SimDescribeTargetGroupsCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeTargetGroupsCommandOutput> {
    const { input } = command;

    this.selection.validate(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("DescribeTargetGroups", options);

    const page = new SimElbV2Page(
      this.selection.resolve(input),
      input.PageSize,
      input.Marker,
    );

    return {
      $metadata: {},
      TargetGroups: page.items.map((targetGroup) =>
        targetGroup.view(this.usage.loadBalancerArns(targetGroup)),
      ),
      NextMarker: page.nextMarker,
    };
  }
}

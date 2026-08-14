import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimEcsClusterCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { describeClustersIncludes } from "./describe-clusters-includes.js";
import { DescribedClusters } from "./described-clusters.js";
import type {
  SimDescribeClustersCommand,
  SimDescribeClustersCommandOutput,
} from "./describe-clusters.command.js";

const acceptedInput: readonly string[] = ["clusters", "include"];

/**
 * Simulated ECS DescribeClustersCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeClustersCommand/
 */
export class DescribeClustersCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimDescribeClustersCommand,
      SimDescribeClustersCommandOutput
    >
{
  private readonly described: DescribedClusters;

  constructor(context: SimEcsClusterCommandContext) {
    super(context, "DescribeClusters", acceptedInput);
    this.described = new DescribedClusters(context);
  }

  /**
   * Describe each named cluster, or the default cluster when none is named.
   */
  async handle(
    command: SimDescribeClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDescribeClustersCommandOutput> {
    this.refuseUnaccepted(command.input);

    const includes = describeClustersIncludes(command.input.include);

    await this.sequence();

    const described = this.described.describe(
      command.input.clusters ?? [],
      includes,
      options,
    );

    return {
      $metadata: {},
      clusters: described.clusters,
      failures: described.failures,
    };
  }
}

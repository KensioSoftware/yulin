import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimEcsClusterStore } from "../../cluster/sim-ecs-cluster-store.js";
import { SimEcsPage } from "../sim-ecs-page.js";
import type { SimEcsClusterCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type {
  SimListClustersCommand,
  SimListClustersCommandOutput,
} from "./list-clusters.command.js";

const acceptedInput: readonly string[] = ["maxResults", "nextToken"];

/**
 * Simulated ECS ListClustersCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListClustersCommand/
 */
export class ListClustersCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimListClustersCommand, SimListClustersCommandOutput>
{
  private readonly clusters: SimEcsClusterStore;

  constructor(context: SimEcsClusterCommandContext) {
    super(context, "ListClusters", acceptedInput);
    this.clusters = context.clusters;
  }

  /**
   * List the ARNs of the active clusters, in the order they were created.
   *
   * A deleted cluster is left out. It is still describable by name, but it is
   * no longer one of the clusters this Account and Region has.
   */
  async handle(
    command: SimListClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimListClustersCommandOutput> {
    this.refuseUnaccepted(command.input);

    await this.sequence();

    this.authorizer.authorizeAnyResource("ecs:ListClusters", options);

    const page = new SimEcsPage<SimArn>(
      this.clusters.active().map((cluster) => cluster.clusterArn),
      command.input,
    );

    return {
      $metadata: {},
      clusterArns: page.items,
      ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
    };
  }
}

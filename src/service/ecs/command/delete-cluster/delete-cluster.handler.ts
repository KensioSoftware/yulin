import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimEcsClusterArn } from "../../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "../../cluster/sim-ecs-cluster-store.js";
import { SimEcsClusterNotFoundException } from "../../error/sim-ecs.error.js";
import type { SimEcsClusterCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import type {
  SimDeleteClusterCommand,
  SimDeleteClusterCommandOutput,
} from "./delete-cluster.command.js";

const acceptedInput: readonly string[] = ["cluster"];

/**
 * Simulated ECS DeleteClusterCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeleteClusterCommand/
 */
export class DeleteClusterCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimDeleteClusterCommand, SimDeleteClusterCommandOutput>
{
  private readonly clusters: SimEcsClusterStore;
  private readonly clusterArn: SimEcsClusterArn;

  constructor(context: SimEcsClusterCommandContext) {
    super(context, "DeleteCluster", acceptedInput);
    this.clusters = context.clusters;
    this.clusterArn = context.clusterArn;
  }

  /**
   * Delete a cluster, which marks it `INACTIVE` rather than removing it.
   *
   * The deleted cluster is what the response reports, as real ECS reports it,
   * and it stays describable afterwards. Creating a cluster of the same name
   * again makes a new active one.
   */
  async handle(
    command: SimDeleteClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDeleteClusterCommandOutput> {
    this.refuseUnaccepted(command.input);

    const identifier = command.input.cluster;
    const clusterName = this.clusterArn.clusterName(identifier);

    await this.sequence();

    this.authorizer.authorizeCluster(
      "ecs:DeleteCluster",
      clusterName === undefined
        ? String(identifier)
        : this.clusterArn.make(clusterName),
      options,
    );

    const cluster = this.deletable(clusterName, identifier);
    cluster.markDeleted();

    return {
      $metadata: {},
      cluster: cluster.toOutput({
        settings: true,
        configuration: true,
        tags: true,
      }),
    };
  }

  private deletable(
    clusterName: string | undefined,
    identifier: string | undefined,
  ): SimEcsCluster {
    const cluster =
      clusterName === undefined
        ? undefined
        : this.clusters.findActive(clusterName);

    if (cluster === undefined) {
      throw new SimEcsClusterNotFoundException(
        `The simulated Account and Region hold no active cluster ` +
          `${identifier ?? "default"}.`,
      );
    }

    return cluster;
  }
}

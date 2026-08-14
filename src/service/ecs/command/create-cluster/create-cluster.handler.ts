import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimEcsClusterCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { CreateClusterFactory } from "./create-cluster-factory.js";
import type {
  SimCreateClusterCommand,
  SimCreateClusterCommandOutput,
} from "./create-cluster.command.js";

/**
 * What a simulated CreateCluster request may declare.
 *
 * Capacity providers and Service Connect defaults are left out because there
 * is no capacity and no service discovery here to attach them to, and a
 * declaration nothing acts on is refused rather than accepted.
 */
const acceptedInput: readonly string[] = [
  "clusterName",
  "settings",
  "configuration",
  "tags",
];

/**
 * Everything a cluster reports, which is what a creation answers with.
 */
const everything = { settings: true, configuration: true, tags: true };

/**
 * Simulated ECS CreateClusterCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/CreateClusterCommand/
 */
export class CreateClusterCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimCreateClusterCommand, SimCreateClusterCommandOutput>
{
  private readonly clusterFactory: CreateClusterFactory;

  constructor(context: SimEcsClusterCommandContext) {
    super(context, "CreateCluster", acceptedInput);
    this.clusterFactory = new CreateClusterFactory(context);
  }

  /**
   * Create a cluster, or hand back the one already holding the name.
   *
   * The name is read before authorization because a malformed request is
   * malformed whoever made it, and nothing is held until the caller has been
   * authorized.
   */
  async handle(
    command: SimCreateClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimCreateClusterCommandOutput> {
    this.refuseUnaccepted(command.input);

    const clusterName = CreateClusterFactory.clusterName(command.input);

    await this.sequence();

    this.authorizer.authorizeAnyResource("ecs:CreateCluster", options);

    const cluster = this.clusterFactory.make(command.input, clusterName);

    return { $metadata: {}, cluster: cluster.toOutput(everything) };
  }
}

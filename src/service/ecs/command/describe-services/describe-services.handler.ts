import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import type { SimEcsServiceArn } from "../../service/sim-ecs-service-arn.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { DescribedServices } from "./described-services.js";
import type {
  SimDescribeServicesCommand,
  SimDescribeServicesCommandOutput,
} from "./describe-services.command.js";

const acceptedInput: readonly string[] = ["cluster", "services"];

/**
 * How many services one request may name, as real ECS limits it.
 */
const maxServices = 10;

/**
 * Simulated ECS DescribeServicesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
 */
export class DescribeServicesCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<
      SimDescribeServicesCommand,
      SimDescribeServicesCommandOutput
    >
{
  private readonly serviceArn: SimEcsServiceArn;
  private readonly requestedCluster: SimEcsRequestedCluster;
  private readonly described: DescribedServices;

  constructor(context: SimEcsServiceCommandContext) {
    super(context, "DescribeServices", acceptedInput);
    this.serviceArn = context.serviceArn;
    this.requestedCluster = new SimEcsRequestedCluster(context);
    this.described = new DescribedServices(context);
  }

  /**
   * The services the request named, which it has to name at least one of.
   */
  private static requestedServices(
    services: readonly string[] | undefined,
  ): readonly string[] {
    if (services === undefined || services.length === 0) {
      throw new SimEcsClientException(
        "DescribeServices needs at least one service, named by its name or " +
          "its full ARN.",
      );
    }

    if (services.length > maxServices) {
      throw new SimEcsClientException(
        `DescribeServices takes at most ${String(maxServices)} services in ` +
          `one request.`,
      );
    }

    return services;
  }

  /**
   * Describe each service the request named, reporting the rest as failures.
   *
   * Each named service is authorized separately, against the ARN it has in the
   * cluster the request named, so a policy naming one service grants that
   * service and no other. The service need not exist to be authorized against.
   */
  async handle(
    command: SimDescribeServicesCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDescribeServicesCommandOutput> {
    this.refuseUnaccepted(command.input);

    const identifiers = DescribeServicesCommandHandler.requestedServices(
      command.input.services,
    );

    await this.sequence();

    const clusterName = this.requestedCluster.name(command.input.cluster);
    this.authorizeEach(identifiers, clusterName, options);

    // Raises for a cluster that is not there, as real ECS does, rather than
    // reporting every service in it as missing.
    this.requestedCluster.active(command.input.cluster);

    const described = this.described.describe(identifiers, clusterName);

    return {
      $metadata: {},
      services: described.services,
      failures: described.failures,
    };
  }

  private authorizeEach(
    identifiers: readonly string[],
    clusterName: string,
    options: SimEcsRequestOptions | undefined,
  ): void {
    for (const identifier of identifiers) {
      const named = this.serviceArn.namedService(identifier);
      const arn =
        named === undefined
          ? identifier
          : this.serviceArn.make(
              named.clusterName ?? clusterName,
              named.serviceName,
            );

      this.authorizer.authorizeService("ecs:DescribeServices", arn, options);
    }
  }
}

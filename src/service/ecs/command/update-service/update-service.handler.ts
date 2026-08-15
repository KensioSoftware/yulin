import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { SimEcsRequestedService } from "../sim-ecs-requested-service.js";
import { SimEcsUpdateServiceRequest } from "./update-service-request.js";
import { SimEcsUpdatedService } from "./updated-service.js";
import type {
  SimUpdateServiceCommand,
  SimUpdateServiceCommandOutput,
} from "./update-service.command.js";

const acceptedInput: readonly string[] = [
  "cluster",
  "service",
  "taskDefinition",
  "desiredCount",
];

/**
 * Simulated ECS UpdateServiceCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/UpdateServiceCommand/
 */
export class UpdateServiceCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimUpdateServiceCommand, SimUpdateServiceCommandOutput>
{
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly requestedCluster: SimEcsRequestedCluster;
  private readonly requestedService: SimEcsRequestedService;
  private readonly updated: SimEcsUpdatedService;

  constructor(context: SimEcsServiceCommandContext) {
    super(context, "UpdateService", acceptedInput);
    this.accountRegionScope = context.accountRegionScope;
    this.requestedCluster = new SimEcsRequestedCluster(context);
    this.requestedService = new SimEcsRequestedService(context);
    this.updated = new SimEcsUpdatedService(context);
  }

  /**
   * Change what a service is keeping running.
   *
   * A new desired count starts or stops tasks to reach it. A new task
   * definition moves the service onto that revision, which replaces every task
   * it is running: real ECS replaces them a few at a time under a deployment
   * configuration, and nothing here takes any time to start.
   */
  async handle(
    command: SimUpdateServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimUpdateServiceCommandOutput> {
    this.refuseUnaccepted(command.input);

    const named = this.requestedService.named(
      command.input.service,
      "UpdateService",
    );
    const request = new SimEcsUpdateServiceRequest(
      command.input,
      this.accountRegionScope,
    );

    await this.sequence();

    const clusterName = this.requestedCluster.name(command.input.cluster);

    this.authorizer.authorizeService(
      "ecs:UpdateService",
      this.requestedService.arn(named, clusterName),
      options,
    );

    const cluster = this.requestedCluster.active(command.input.cluster);
    const service = this.requestedService.active(named, cluster.clusterName);

    this.updated.apply(service, cluster, request);

    return { $metadata: {}, service: service.toOutput() };
  }
}

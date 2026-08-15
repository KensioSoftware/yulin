import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsServiceTasks } from "../../service/run/sim-ecs-service-tasks.js";
import type { SimEcsServiceArn } from "../../service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "../../service/sim-ecs-service-store.js";
import { SimEcsService } from "../../service/sim-ecs-service.js";
import { requiredRunnableTaskDefinition } from "../../task-definition/sim-ecs-runnable-task-definition.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { SimEcsCreateServiceRequest } from "./create-service-request.js";
import type {
  SimCreateServiceCommand,
  SimCreateServiceCommandOutput,
} from "./create-service.command.js";

const acceptedInput: readonly string[] = [
  "cluster",
  "serviceName",
  "taskDefinition",
  "desiredCount",
  "launchType",
  "schedulingStrategy",
  "loadBalancers",
];

/**
 * Simulated ECS CreateServiceCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/CreateServiceCommand/
 */
export class CreateServiceCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimCreateServiceCommand, SimCreateServiceCommandOutput>
{
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly services: SimEcsServiceStore;
  private readonly serviceArn: SimEcsServiceArn;
  private readonly serviceTasks: SimEcsServiceTasks;
  private readonly requestedCluster: SimEcsRequestedCluster;

  constructor(context: SimEcsServiceCommandContext) {
    super(context, "CreateService", acceptedInput);
    this.accountRegionScope = context.accountRegionScope;
    this.taskDefinitions = context.taskDefinitions;
    this.services = context.services;
    this.serviceArn = context.serviceArn;
    this.serviceTasks = context.serviceTasks;
    this.requestedCluster = new SimEcsRequestedCluster(context);
  }

  /**
   * Create a service, and start the tasks it keeps running.
   *
   * The service is answered with the counts it has as the request is answered,
   * which is a desired count and nothing running yet, as real ECS answers one.
   * Its tasks reach `RUNNING` on the simulator's background work.
   *
   * A load balancer the request declares is recorded on the service and not
   * acted on. Nothing here sends a service container a request yet, so the
   * declaration is what a target group has to read to find the service that
   * answers for it.
   */
  async handle(
    command: SimCreateServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimCreateServiceCommandOutput> {
    this.refuseUnaccepted(command.input);

    const request = new SimEcsCreateServiceRequest(
      command.input,
      this.accountRegionScope,
    );

    await this.sequence();

    const cluster = this.requestedCluster.active(command.input.cluster);
    const taskDefinition = requiredRunnableTaskDefinition(
      this.taskDefinitions.resolve(request.taskDefinitionId),
    );
    const serviceArn = this.serviceArn.make(
      cluster.clusterName,
      request.serviceName,
    );
    const caller = this.authorizer.authorizeService(
      "ecs:CreateService",
      serviceArn,
      options,
    );

    this.refuseExisting(cluster, request.serviceName);

    const service = new SimEcsService({
      serviceArn,
      serviceName: request.serviceName,
      clusterArn: cluster.clusterArn,
      clusterName: cluster.clusterName,
      taskDefinitionArn: taskDefinition.taskDefinitionArn,
      desiredCount: request.desiredCount,
      createdAt: this.background.now(),
      launchType: command.input.launchType,
      createdBy: caller.arn,
      loadBalancers: command.input.loadBalancers,
    });

    this.services.put(service);
    this.serviceTasks.reconcile({ service, cluster, taskDefinition });

    return { $metadata: {}, service: service.toOutput() };
  }

  /**
   * Refuse a name an active service of the cluster already has.
   *
   * Real ECS reports this rather than handing the existing service back, which
   * is the opposite of what `CreateCluster` does with a name already taken. A
   * deleted service's name is free again, and creating it replaces the deleted
   * one.
   */
  private refuseExisting(cluster: SimEcsCluster, serviceName: string): void {
    if (
      this.services.findActive(cluster.clusterName, serviceName) !== undefined
    ) {
      throw new SimEcsInvalidParameterException(
        `The cluster ${cluster.clusterName} already holds an active service ` +
          `${serviceName}.`,
      );
    }
  }
}

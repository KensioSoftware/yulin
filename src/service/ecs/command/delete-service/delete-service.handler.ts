import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimEcsServiceTasks } from "../../service/run/sim-ecs-service-tasks.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { SimEcsRequestedService } from "../sim-ecs-requested-service.js";
import { requiredDeletableService } from "./deletable-service.js";
import type {
  SimDeleteServiceCommand,
  SimDeleteServiceCommandOutput,
} from "./delete-service.command.js";

const acceptedInput: readonly string[] = ["cluster", "service", "force"];

/**
 * Why a task of a deleted service stopped.
 */
const deletedReason = "Task stopped by the service being deleted.";

/**
 * Simulated ECS DeleteServiceCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DeleteServiceCommand/
 */
export class DeleteServiceCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimDeleteServiceCommand, SimDeleteServiceCommandOutput>
{
  private readonly serviceTasks: SimEcsServiceTasks;
  private readonly requestedCluster: SimEcsRequestedCluster;
  private readonly requestedService: SimEcsRequestedService;

  constructor(context: SimEcsServiceCommandContext) {
    super(context, "DeleteService", acceptedInput);
    this.serviceTasks = context.serviceTasks;
    this.requestedCluster = new SimEcsRequestedCluster(context);
    this.requestedService = new SimEcsRequestedService(context);
  }

  /**
   * Delete a service, stopping everything it was running.
   *
   * The service is marked `INACTIVE` rather than removed, as real ECS leaves a
   * deleted one, so something holding its ARN can still find out what became of
   * it. Its tasks stop at once and drop out of a `ListTasks` of running tasks.
   */
  async handle(
    command: SimDeleteServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDeleteServiceCommandOutput> {
    this.refuseUnaccepted(command.input);

    const named = this.requestedService.named(
      command.input.service,
      "DeleteService",
    );

    await this.sequence();

    const clusterName = this.requestedCluster.name(command.input.cluster);

    this.authorizer.authorizeService(
      "ecs:DeleteService",
      this.requestedService.arn(named, clusterName),
      options,
    );

    const cluster = this.requestedCluster.active(command.input.cluster);
    const service = this.requestedService.active(named, cluster.clusterName);

    requiredDeletableService(service, command.input.force);
    this.serviceTasks.stopAll(service, deletedReason);
    service.markDeleted();

    return { $metadata: {}, service: service.toOutput() };
  }
}

import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsServiceTasks } from "../../service/run/sim-ecs-service-tasks.js";
import type { SimEcsService } from "../../service/sim-ecs-service.js";
import { requiredRunnableTaskDefinition } from "../../task-definition/sim-ecs-runnable-task-definition.js";
import { SimEcsTaskDefinitionId } from "../../task-definition/sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsServiceCommandContext } from "../sim-ecs-command-context.js";
import type { SimEcsUpdateServiceRequest } from "./update-service-request.js";

/**
 * Applies what an `UpdateService` request asked for to a service.
 *
 * The two changes are not independent. A new desired count is reached by
 * starting or stopping tasks, while a new revision replaces every task the
 * service holds, so the count has to be settled before the tasks are brought to
 * it.
 */
export class SimEcsUpdatedService {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly serviceTasks: SimEcsServiceTasks;

  constructor(context: SimEcsServiceCommandContext) {
    this.accountRegionScope = context.accountRegionScope;
    this.taskDefinitions = context.taskDefinitions;
    this.serviceTasks = context.serviceTasks;
  }

  /**
   * Apply an update to a service, and bring its tasks to what it now wants.
   */
  apply(
    service: SimEcsService,
    cluster: SimEcsCluster,
    request: SimEcsUpdateServiceRequest,
  ): void {
    const taskDefinition = this.revisionFor(service, request);
    const deployment = { service, cluster, taskDefinition };

    if (request.desiredCount !== undefined) {
      service.scaleTo(request.desiredCount);
    }

    if (taskDefinition.taskDefinitionArn === service.taskDefinitionArn) {
      this.serviceTasks.reconcile(deployment);
      return;
    }

    service.moveTo(taskDefinition.taskDefinitionArn);
    this.serviceTasks.redeploy(deployment);
  }

  /**
   * The revision the service runs once this update has been applied.
   *
   * A request naming none leaves the service where it is, which is read back
   * from the ARN it holds rather than resolved again from the family: the
   * latest active revision may have moved on since, and scaling a service out
   * is not a deployment.
   */
  private revisionFor(
    service: SimEcsService,
    request: SimEcsUpdateServiceRequest,
  ): SimEcsTaskDefinition {
    if (request.taskDefinitionId === undefined) {
      return this.taskDefinitions.resolve(
        SimEcsTaskDefinitionId.parse(
          service.taskDefinitionArn,
          this.accountRegionScope,
        ),
      );
    }

    return requiredRunnableTaskDefinition(
      this.taskDefinitions.resolve(request.taskDefinitionId),
    );
  }
}

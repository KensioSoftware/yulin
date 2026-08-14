import type { SimArn } from "../../aws/arn.js";
import type { SimEcsCluster } from "../cluster/sim-ecs-cluster.js";
import type { SimEcsTaskDefinition } from "../task-definition/sim-ecs-task-definition.js";
import { SimEcsTaskArn } from "./sim-ecs-task-arn.js";
import { SimEcsTaskContainer } from "./sim-ecs-task-container.js";
import { SimEcsTask } from "./sim-ecs-task.js";

interface SimEcsStartingTask {
  readonly cluster: SimEcsCluster;
  readonly taskDefinition: SimEcsTaskDefinition;
  readonly createdAt: Date;
  readonly group?: string | undefined;
  readonly startedBy?: string | undefined;
  readonly launchType?: string | undefined;
}

/**
 * Builds the task a `RunTask` request starts.
 *
 * A task holds a record of every container its definition declares, whether or
 * not anything is bound to run it, so a describe answers for all of them from
 * the moment the task exists rather than only for the ones that ran.
 */
export class SimEcsTaskFactory {
  private readonly taskArn: SimEcsTaskArn;

  constructor(taskArn: SimEcsTaskArn) {
    this.taskArn = taskArn;
  }

  /**
   * Build one task, in the state real ECS answers `RunTask` with.
   */
  make(starting: SimEcsStartingTask): SimEcsTask {
    const { cluster, taskDefinition } = starting;
    const taskId = SimEcsTaskArn.newTaskId();
    const arn = this.taskArn.make(cluster.clusterName, taskId);

    return new SimEcsTask({
      taskId,
      taskArn: arn,
      clusterArn: cluster.clusterArn,
      clusterName: cluster.clusterName,
      taskDefinitionArn: taskDefinition.taskDefinitionArn,
      family: taskDefinition.family,
      group: starting.group ?? `family:${taskDefinition.family}`,
      containers: this.containersFor(starting, taskId, arn),
      createdAt: starting.createdAt,
      launchType: starting.launchType,
      startedBy: starting.startedBy,
    });
  }

  private containersFor(
    starting: SimEcsStartingTask,
    taskId: string,
    taskArn: SimArn,
  ): readonly SimEcsTaskContainer[] {
    return starting.taskDefinition.containers.all().map(
      (declared) =>
        new SimEcsTaskContainer({
          containerArn: this.taskArn.makeContainer(
            starting.cluster.clusterName,
            taskId,
            SimEcsTaskArn.newContainerId(),
          ),
          taskArn,
          name: declared.name,
          image: declared.image,
        }),
    );
  }
}

import type { SimEcsTaskArn } from "../../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import type { SimEcsTaskDetail } from "../../task/sim-ecs-task-detail.js";
import type { SimEcsFailure } from "../describe-clusters/describe-clusters.command.js";
import type { SimEcsTaskCommandContext } from "../sim-ecs-command-context.js";

/**
 * What ECS reports for a task it cannot find.
 */
const missingReason = "MISSING";

/**
 * What a `DescribeTasks` request answers with.
 */
export interface DescribedTasksOutput {
  readonly tasks: readonly SimEcsTaskDetail[];
  readonly failures: readonly SimEcsFailure[];
}

/**
 * Describes the tasks one request named, splitting answers from failures.
 *
 * A task ECS cannot find is a failure entry rather than an error, so one
 * request naming several tasks answers for each of them. A task in another
 * cluster is one it cannot find: a task belongs to the cluster it was started
 * in, and naming it under a different one names nothing.
 */
export class DescribedTasks {
  private readonly tasks: SimEcsTaskStore;
  private readonly taskArn: SimEcsTaskArn;

  constructor(context: SimEcsTaskCommandContext) {
    this.tasks = context.tasks;
    this.taskArn = context.taskArn;
  }

  /**
   * Describe each task identifier a request named, in the order it named them.
   */
  describe(
    identifiers: readonly string[],
    clusterName: string,
  ): DescribedTasksOutput {
    const tasks: SimEcsTaskDetail[] = [];
    const failures: SimEcsFailure[] = [];

    for (const identifier of identifiers) {
      const described = this.describeOne(identifier, clusterName);

      if (described === undefined) {
        failures.push(this.failureFor(identifier, clusterName));
        continue;
      }

      tasks.push(described);
    }

    return { tasks, failures };
  }

  private describeOne(
    identifier: string,
    clusterName: string,
  ): SimEcsTaskDetail | undefined {
    const named = this.taskArn.namedTask(identifier);

    if (named === undefined) {
      return undefined;
    }

    if (named.clusterName !== undefined && named.clusterName !== clusterName) {
      return undefined;
    }

    const task = this.tasks.find(named.taskId);

    if (task === undefined || task.clusterName !== clusterName) {
      return undefined;
    }

    return task.toOutput();
  }

  /**
   * The failure entry for a task that is not there.
   *
   * ECS reports the ARN of the task it looked for, so an identifier given as
   * an id is reported as the ARN it would have had in the cluster the request
   * named. One that is not a task identifier at all is reported as it came.
   */
  private failureFor(identifier: string, clusterName: string): SimEcsFailure {
    const named = this.taskArn.namedTask(identifier);

    if (named === undefined) {
      return { arn: identifier, reason: missingReason };
    }

    return {
      arn: this.taskArn.make(named.clusterName ?? clusterName, named.taskId),
      reason: missingReason,
    };
  }
}

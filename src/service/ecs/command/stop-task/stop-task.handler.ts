import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  SimEcsClientException,
  SimEcsInvalidParameterException,
} from "../../error/sim-ecs.error.js";
import type {
  SimEcsNamedTask,
  SimEcsTaskArn,
} from "../../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import type { SimEcsTask } from "../../task/sim-ecs-task.js";
import type { SimEcsTaskCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import type {
  SimStopTaskCommand,
  SimStopTaskCommandOutput,
} from "./stop-task.command.js";

const acceptedInput: readonly string[] = ["cluster", "task", "reason"];

/**
 * What a stopped task records when the request gave no reason.
 */
const defaultReason = "Task stopped by user request.";

/**
 * Simulated ECS StopTaskCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/StopTaskCommand/
 */
export class StopTaskCommandHandler
  extends SimEcsCommandHandler
  implements CommandHandler<SimStopTaskCommand, SimStopTaskCommandOutput>
{
  private readonly tasks: SimEcsTaskStore;
  private readonly taskArn: SimEcsTaskArn;
  private readonly requestedCluster: SimEcsRequestedCluster;

  constructor(context: SimEcsTaskCommandContext) {
    super(context, "StopTask", acceptedInput);
    this.tasks = context.tasks;
    this.taskArn = context.taskArn;
    this.requestedCluster = new SimEcsRequestedCluster(context);
  }

  /**
   * Ask a task to stop, and report it as it stands.
   *
   * Only the desired status changes here, as it does on real ECS: the task
   * reaches `STOPPED` when the run gets to it. A task whose containers have
   * not started yet runs none of them, and one part way through runs no more.
   * A task that has already stopped is reported unchanged, keeping the reason
   * it stopped for.
   */
  async handle(
    command: SimStopTaskCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimStopTaskCommandOutput> {
    this.refuseUnaccepted(command.input);

    const named = this.requiredTask(command.input.task);

    await this.sequence();

    const clusterName = this.requestedCluster.name(command.input.cluster);

    this.authorizer.authorizeTask(
      "ecs:StopTask",
      this.taskArn.make(named.clusterName ?? clusterName, named.taskId),
      options,
    );

    this.requestedCluster.active(command.input.cluster);

    const task = this.stoppable(named, clusterName);
    task.requestStop(command.input.reason ?? defaultReason);

    return { $metadata: {}, task: task.toOutput() };
  }

  /**
   * The task the request named, which it has to name.
   */
  private requiredTask(task: string | undefined): SimEcsNamedTask {
    const named =
      task === undefined || task === ""
        ? undefined
        : this.taskArn.namedTask(task);

    if (named === undefined) {
      throw new SimEcsClientException(
        "StopTask needs the task to stop, named by its id or its full ARN.",
      );
    }

    return named;
  }

  /**
   * The task to stop, which has to be one this cluster holds.
   */
  private stoppable(named: SimEcsNamedTask, clusterName: string): SimEcsTask {
    const task = this.tasks.find(named.taskId);
    const namedCluster = named.clusterName ?? clusterName;

    if (
      namedCluster !== clusterName ||
      task === undefined ||
      task.clusterName !== clusterName
    ) {
      throw new SimEcsInvalidParameterException(
        `The referenced task ${named.taskId} was not found in cluster ` +
          `${namedCluster}.`,
      );
    }

    return task;
  }
}

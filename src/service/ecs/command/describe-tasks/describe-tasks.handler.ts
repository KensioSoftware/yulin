import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import type { SimEcsTaskArn } from "../../task/sim-ecs-task-arn.js";
import type { SimEcsTaskCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { DescribedTasks } from "./described-tasks.js";
import type {
  SimDescribeTasksCommand,
  SimDescribeTasksCommandOutput,
} from "./describe-tasks.command.js";

const acceptedInput: readonly string[] = ["cluster", "tasks"];

/**
 * How many tasks one request may name, as real ECS limits it.
 */
const maxTasks = 100;

/**
 * Simulated ECS DescribeTasksCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTasksCommand/
 */
export class DescribeTasksCommandHandler
  extends SimEcsCommandHandler
  implements
    CommandHandler<SimDescribeTasksCommand, SimDescribeTasksCommandOutput>
{
  private readonly taskArn: SimEcsTaskArn;
  private readonly requestedCluster: SimEcsRequestedCluster;
  private readonly described: DescribedTasks;

  constructor(context: SimEcsTaskCommandContext) {
    super(context, "DescribeTasks", acceptedInput);
    this.taskArn = context.taskArn;
    this.requestedCluster = new SimEcsRequestedCluster(context);
    this.described = new DescribedTasks(context);
  }

  /**
   * The tasks the request named, which it has to name at least one of.
   */
  private static requestedTasks(
    tasks: readonly string[] | undefined,
  ): readonly string[] {
    if (tasks === undefined || tasks.length === 0) {
      throw new SimEcsClientException(
        "DescribeTasks needs at least one task, named by its id or its full " +
          "ARN.",
      );
    }

    if (tasks.length > maxTasks) {
      throw new SimEcsClientException(
        `DescribeTasks takes at most ${String(maxTasks)} tasks in one ` +
          `request.`,
      );
    }

    return tasks;
  }

  /**
   * Describe each task the request named, reporting the rest as failures.
   *
   * Each named task is authorized separately, against the ARN it has in the
   * cluster the request named, so a policy naming one task grants that task
   * and no other. The task need not exist to be authorized against, as it need
   * not for a cluster.
   */
  async handle(
    command: SimDescribeTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimDescribeTasksCommandOutput> {
    this.refuseUnaccepted(command.input);

    const identifiers = DescribeTasksCommandHandler.requestedTasks(
      command.input.tasks,
    );

    await this.sequence();

    const clusterName = this.requestedCluster.name(command.input.cluster);
    this.authorizeEach(identifiers, clusterName, options);

    // Raises for a cluster that is not there, as real ECS does, rather than
    // reporting every task in it as missing.
    this.requestedCluster.active(command.input.cluster);

    const described = this.described.describe(identifiers, clusterName);

    return {
      $metadata: {},
      tasks: described.tasks,
      failures: described.failures,
    };
  }

  private authorizeEach(
    identifiers: readonly string[],
    clusterName: string,
    options: SimEcsRequestOptions | undefined,
  ): void {
    for (const identifier of identifiers) {
      const named = this.taskArn.namedTask(identifier);
      const arn =
        named === undefined
          ? identifier
          : this.taskArn.make(named.clusterName ?? clusterName, named.taskId);

      this.authorizer.authorizeTask("ecs:DescribeTasks", arn, options);
    }
  }
}

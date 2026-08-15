import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import { SimEcsPage } from "../sim-ecs-page.js";
import type { SimEcsTaskCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { listTasksDesiredStatus } from "./list-tasks-desired-status.js";
import type {
  SimListTasksCommand,
  SimListTasksCommandOutput,
} from "./list-tasks.command.js";

const acceptedInput: readonly string[] = [
  "cluster",
  "family",
  "desiredStatus",
  "serviceName",
  "startedBy",
  "launchType",
  "maxResults",
  "nextToken",
];

/**
 * Simulated ECS ListTasksCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListTasksCommand/
 */
export class ListTasksCommandHandler
  extends SimEcsCommandHandler
  implements CommandHandler<SimListTasksCommand, SimListTasksCommandOutput>
{
  private readonly tasks: SimEcsTaskStore;
  private readonly requestedCluster: SimEcsRequestedCluster;

  constructor(context: SimEcsTaskCommandContext) {
    super(context, "ListTasks", acceptedInput);
    this.tasks = context.tasks;
    this.requestedCluster = new SimEcsRequestedCluster(context);
  }

  /**
   * List the ARNs of the tasks in a cluster, oldest first.
   *
   * Real ECS gives this action no resource type, so it authorizes against `*`
   * the way `ListClusters` does. A policy naming one cluster grants no listing.
   */
  async handle(
    command: SimListTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimListTasksCommandOutput> {
    this.refuseUnaccepted(command.input);

    const desiredStatus = listTasksDesiredStatus(command.input.desiredStatus);

    await this.sequence();

    this.authorizer.authorizeAnyResource("ecs:ListTasks", options);

    const cluster = this.requestedCluster.active(command.input.cluster);
    const listed = this.tasks.list({
      clusterName: cluster.clusterName,
      desiredStatus,
      family: command.input.family,
      serviceName: command.input.serviceName,
      startedBy: command.input.startedBy,
      launchType: command.input.launchType,
    });
    const page = new SimEcsPage<SimArn>(
      listed.map((task) => task.taskArn),
      command.input,
    );

    return {
      $metadata: {},
      taskArns: page.items,
      ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
    };
  }
}

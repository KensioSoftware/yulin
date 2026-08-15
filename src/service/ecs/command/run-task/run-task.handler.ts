import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import { SimEcsTaskRunner } from "../../task/run/sim-ecs-task-runner.js";
import { SimEcsTaskFactory } from "../../task/sim-ecs-task-factory.js";
import type { SimEcsTaskStore } from "../../task/sim-ecs-task-store.js";
import type { SimEcsTask } from "../../task/sim-ecs-task.js";
import type { SimEcsTaskDefinitionStore } from "../../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsRunTaskCommandContext } from "../sim-ecs-command-context.js";
import { SimEcsCommandHandler } from "../sim-ecs-command-handler.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";
import { SimEcsRequestedCluster } from "../sim-ecs-requested-cluster.js";
import { SimEcsRunTaskRequest } from "./run-task-request.js";
import type {
  SimRunTaskCommand,
  SimRunTaskCommandInput,
  SimRunTaskCommandOutput,
} from "./run-task.command.js";

const acceptedInput: readonly string[] = [
  "cluster",
  "taskDefinition",
  "count",
  "group",
  "launchType",
  "overrides",
  "startedBy",
];

/**
 * What one task of a `RunTask` request is started from.
 */
interface SimEcsStartingTask {
  readonly cluster: SimEcsCluster;
  readonly taskDefinition: SimEcsTaskDefinition;
  readonly request: SimEcsRunTaskRequest;
}

/**
 * Simulated ECS RunTaskCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/RunTaskCommand/
 */
export class RunTaskCommandHandler
  extends SimEcsCommandHandler
  implements CommandHandler<SimRunTaskCommand, SimRunTaskCommandOutput>
{
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly tasks: SimEcsTaskStore;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly requestedCluster: SimEcsRequestedCluster;
  private readonly taskFactory: SimEcsTaskFactory;
  private readonly runner: SimEcsTaskRunner;

  constructor(context: SimEcsRunTaskCommandContext) {
    super(context, "RunTask", acceptedInput);
    this.taskDefinitions = context.taskDefinitions;
    this.tasks = context.tasks;
    this.accountRegionScope = context.accountRegionScope;
    this.requestedCluster = new SimEcsRequestedCluster(context);
    this.taskFactory = new SimEcsTaskFactory(context.taskArn);
    this.runner = new SimEcsTaskRunner({
      bindings: context.bindings,
      background: context.background,
      runAsOwner: context.runAsOwner,
      regionName: context.accountRegionScope.regionName,
      secretStores: context.secretStores,
    });
  }

  /**
   * Start a task in a cluster, and answer before its containers run.
   *
   * The task is returned in the state real ECS returns one in, which is a task
   * that has not started yet. Its containers run on the simulator's background
   * work, so a test reads what they did once that work is complete.
   *
   * The task definition is resolved before the caller is authorized, because
   * `RunTask` authorizes against the revision it would run and a family named
   * on its own does not say which revision that is.
   */
  async handle(
    command: SimRunTaskCommand,
    options?: SimEcsRequestOptions,
  ): Promise<SimRunTaskCommandOutput> {
    this.refuseUnaccepted(command.input);

    const request = new SimEcsRunTaskRequest(
      command.input,
      this.accountRegionScope,
    );

    await this.sequence();

    const cluster = this.requestedCluster.active(command.input.cluster);
    const taskDefinition = this.runnable(
      this.taskDefinitions.resolve(request.taskDefinitionId),
    );
    request.overrides.refuseUnknownContainers(taskDefinition.containers);

    this.authorizer.authorizeTaskDefinition(
      "ecs:RunTask",
      taskDefinition.taskDefinitionArn,
      options,
    );

    const started = Array.from({ length: request.count }, () =>
      this.startTask({ cluster, taskDefinition, request }, command.input),
    );

    return {
      $metadata: {},
      tasks: started.map((task) => task.toOutput()),
      failures: [],
    };
  }

  private startTask(
    starting: SimEcsStartingTask,
    input: SimRunTaskCommandInput,
  ): SimEcsTask {
    const task = this.taskFactory.make({
      cluster: starting.cluster,
      taskDefinition: starting.taskDefinition,
      createdAt: this.background.now(),
      group: input.group,
      startedBy: input.startedBy,
      launchType: input.launchType,
    });

    this.tasks.put(task);
    this.runner.start({
      task,
      taskDefinition: starting.taskDefinition,
      overrides: starting.request.overrides,
    });

    return task;
  }

  /**
   * The revision to run, which has to be one that is still registered.
   *
   * Real ECS refuses to run a revision that has been deregistered, and it is
   * worth refusing here: a deregistered revision is one nothing is meant to
   * start from any more.
   */
  private runnable(taskDefinition: SimEcsTaskDefinition): SimEcsTaskDefinition {
    if (!taskDefinition.isActive()) {
      throw new SimEcsClientException(
        `Task definition ${taskDefinition.family}:` +
          `${String(taskDefinition.revision)} is INACTIVE, so no task can be ` +
          `run from it.`,
      );
    }

    return taskDefinition;
  }
}

import { BackgroundTasks } from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimIamAllowAllAuth } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimEcsContainerBindings } from "./bind/sim-ecs-container-bindings.js";
import type { SimEcsContainerBinding } from "./bind/sim-ecs-container-binding.type.js";
import { SimEcsClusterStore } from "./cluster/sim-ecs-cluster-store.js";
import { SimEcsAuthorizer } from "./command/authorize/sim-ecs-authorizer.js";
import { SimEcsCommandContexts } from "./command/sim-ecs-command-contexts.js";
import { CreateClusterCommandHandler } from "./command/create-cluster/create-cluster.handler.js";
import { DeleteClusterCommandHandler } from "./command/delete-cluster/delete-cluster.handler.js";
import { DeregisterTaskDefinitionCommandHandler } from "./command/deregister-task-definition/deregister-task-definition.handler.js";
import { DescribeClustersCommandHandler } from "./command/describe-clusters/describe-clusters.handler.js";
import { DescribeTaskDefinitionCommandHandler } from "./command/describe-task-definition/describe-task-definition.handler.js";
import { DescribeTasksCommandHandler } from "./command/describe-tasks/describe-tasks.handler.js";
import { ListClustersCommandHandler } from "./command/list-clusters/list-clusters.handler.js";
import { ListTaskDefinitionFamiliesCommandHandler } from "./command/list-task-definition-families/list-task-definition-families.handler.js";
import { ListTaskDefinitionsCommandHandler } from "./command/list-task-definitions/list-task-definitions.handler.js";
import { ListTasksCommandHandler } from "./command/list-tasks/list-tasks.handler.js";
import { RegisterTaskDefinitionCommandHandler } from "./command/register-task-definition/register-task-definition.handler.js";
import { RunTaskCommandHandler } from "./command/run-task/run-task.handler.js";
import { StopTaskCommandHandler } from "./command/stop-task/stop-task.handler.js";
import type * as simEcsCommands from "./command/sim-ecs-command.types.js";
import type { SimEcsRequestOptions } from "./command/sim-ecs-request-options.js";
import { SimEcsSdkCommandRouter } from "./sdk/sim-ecs-sdk-command-router.js";
import type { SimEcsProperties } from "./sim-ecs-properties.js";
import { SimEcsUnreachableSecretStores } from "./task/run/secret/sim-ecs-secret-stores.js";
import { SimEcsTaskStore } from "./task/sim-ecs-task-store.js";
import { SimEcsTaskDefinitionStore } from "./task-definition/sim-ecs-task-definition-store.js";

/**
 * Simulated ECS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Clusters and task definitions are scoped to an account and region, as they
 * are on real AWS: both ARNs name the region, and a cluster name is unique
 * within one account and region rather than globally.
 *
 * A task runs the handlers bound to the containers its task definition
 * declares. Nothing else runs: Yulin never looks inside a container image, so
 * a container with no binding is recorded as not simulated rather than
 * failing anything.
 */
export class SimEcs {
  private readonly clusters = new SimEcsClusterStore();
  private readonly taskDefinitions = new SimEcsTaskDefinitionStore();
  private readonly tasks = new SimEcsTaskStore();
  private readonly bindings = new SimEcsContainerBindings();

  private readonly createClusterCommand: CreateClusterCommandHandler;
  private readonly describeClustersCommand: DescribeClustersCommandHandler;
  private readonly deleteClusterCommand: DeleteClusterCommandHandler;
  private readonly listClustersCommand: ListClustersCommandHandler;
  private readonly registerTaskDefinitionCommand: RegisterTaskDefinitionCommandHandler;
  private readonly deregisterTaskDefinitionCommand: DeregisterTaskDefinitionCommandHandler;
  private readonly describeTaskDefinitionCommand: DescribeTaskDefinitionCommandHandler;
  private readonly listTaskDefinitionsCommand: ListTaskDefinitionsCommandHandler;
  private readonly listTaskDefinitionFamiliesCommand: ListTaskDefinitionFamiliesCommandHandler;
  private readonly runTaskCommand: RunTaskCommandHandler;
  private readonly describeTasksCommand: DescribeTasksCommandHandler;
  private readonly listTasksCommand: ListTasksCommandHandler;
  private readonly stopTaskCommand: StopTaskCommandHandler;
  private readonly sdkRouter = new SimEcsSdkCommandRouter(this);

  constructor(properties: SimEcsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      runAsOwner = this,
      secretStores = new SimEcsUnreachableSecretStores(),
    } = properties;

    const contexts = new SimEcsCommandContexts({
      accountRegionScope,
      authorizer: new SimEcsAuthorizer({ iam }),
      background,
      runAsOwner,
      clusters: this.clusters,
      taskDefinitions: this.taskDefinitions,
      tasks: this.tasks,
      bindings: this.bindings,
      secretStores,
    });
    const { cluster, taskDefinition, task } = contexts;

    this.runTaskCommand = new RunTaskCommandHandler(contexts.runTask);
    this.describeTasksCommand = new DescribeTasksCommandHandler(task);
    this.listTasksCommand = new ListTasksCommandHandler(task);
    this.stopTaskCommand = new StopTaskCommandHandler(task);

    this.createClusterCommand = new CreateClusterCommandHandler(cluster);
    this.describeClustersCommand = new DescribeClustersCommandHandler(cluster);
    this.deleteClusterCommand = new DeleteClusterCommandHandler(cluster);
    this.listClustersCommand = new ListClustersCommandHandler(cluster);
    this.registerTaskDefinitionCommand =
      new RegisterTaskDefinitionCommandHandler(taskDefinition);
    this.deregisterTaskDefinitionCommand =
      new DeregisterTaskDefinitionCommandHandler(taskDefinition);
    this.describeTaskDefinitionCommand =
      new DescribeTaskDefinitionCommandHandler(taskDefinition);
    this.listTaskDefinitionsCommand = new ListTaskDefinitionsCommandHandler(
      taskDefinition,
    );
    this.listTaskDefinitionFamiliesCommand =
      new ListTaskDefinitionFamiliesCommandHandler(taskDefinition);
  }

  /**
   * Handle a CreateCluster Command from the SDK.
   */
  async createCluster(
    command: simEcsCommands.SimCreateClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimCreateClusterCommandOutput> {
    return await this.createClusterCommand.handle(command, options);
  }

  /**
   * Handle a DescribeClusters Command from the SDK.
   */
  async describeClusters(
    command: simEcsCommands.SimDescribeClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeClustersCommandOutput> {
    return await this.describeClustersCommand.handle(command, options);
  }

  /**
   * Handle a DeleteCluster Command from the SDK.
   */
  async deleteCluster(
    command: simEcsCommands.SimDeleteClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDeleteClusterCommandOutput> {
    return await this.deleteClusterCommand.handle(command, options);
  }

  /**
   * Handle a ListClusters Command from the SDK.
   */
  async listClusters(
    command: simEcsCommands.SimListClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListClustersCommandOutput> {
    return await this.listClustersCommand.handle(command, options);
  }

  /**
   * Handle a RegisterTaskDefinition Command from the SDK.
   */
  async registerTaskDefinition(
    command: simEcsCommands.SimRegisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimRegisterTaskDefinitionCommandOutput> {
    return await this.registerTaskDefinitionCommand.handle(command, options);
  }

  /**
   * Handle a DeregisterTaskDefinition Command from the SDK.
   */
  async deregisterTaskDefinition(
    command: simEcsCommands.SimDeregisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDeregisterTaskDefinitionCommandOutput> {
    return await this.deregisterTaskDefinitionCommand.handle(command, options);
  }

  /**
   * Handle a DescribeTaskDefinition Command from the SDK.
   */
  async describeTaskDefinition(
    command: simEcsCommands.SimDescribeTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeTaskDefinitionCommandOutput> {
    return await this.describeTaskDefinitionCommand.handle(command, options);
  }

  /**
   * Handle a ListTaskDefinitions Command from the SDK.
   */
  async listTaskDefinitions(
    command: simEcsCommands.SimListTaskDefinitionsCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTaskDefinitionsCommandOutput> {
    return await this.listTaskDefinitionsCommand.handle(command, options);
  }

  /**
   * Handle a ListTaskDefinitionFamilies Command from the SDK.
   */
  async listTaskDefinitionFamilies(
    command: simEcsCommands.SimListTaskDefinitionFamiliesCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTaskDefinitionFamiliesCommandOutput> {
    return await this.listTaskDefinitionFamiliesCommand.handle(
      command,
      options,
    );
  }

  /**
   * Handle a RunTask Command from the SDK.
   */
  async runTask(
    command: simEcsCommands.SimRunTaskCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimRunTaskCommandOutput> {
    return await this.runTaskCommand.handle(command, options);
  }

  /**
   * Handle a DescribeTasks Command from the SDK.
   */
  async describeTasks(
    command: simEcsCommands.SimDescribeTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeTasksCommandOutput> {
    return await this.describeTasksCommand.handle(command, options);
  }

  /**
   * Handle a ListTasks Command from the SDK.
   */
  async listTasks(
    command: simEcsCommands.SimListTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTasksCommandOutput> {
    return await this.listTasksCommand.handle(command, options);
  }

  /**
   * Handle a StopTask Command from the SDK.
   */
  async stopTask(
    command: simEcsCommands.SimStopTaskCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimStopTaskCommandOutput> {
    return await this.stopTaskCommand.handle(command, options);
  }

  /**
   * Bind a real in-process handler to a container a task definition declares.
   *
   * The container is named either by its family and container name or by the
   * repository its image comes from. A task run from that definition runs the
   * bound handler in this process, with the container's environment variables
   * and the task Role.
   *
   * ```typescript
   * simAws.ecs().bindContainer({
   *   family: "orders-worker",
   *   containerName: "app",
   *   run: async () => {
   *     await processOutstandingOrders();
   *   },
   * });
   * ```
   *
   * Bindings belong to the Account and Region they were made in, as the task
   * definitions they target do, and can be made before or after the task
   * definition is registered.
   */
  bindContainer(binding: SimEcsContainerBinding): void {
    this.bindings.add(binding);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

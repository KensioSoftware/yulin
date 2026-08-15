import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimEcsContainerBinding } from "./bind/sim-ecs-container-binding.type.js";
import type * as simEcsCommands from "./command/sim-ecs-command.types.js";
import type { SimEcsRequestOptions } from "./command/sim-ecs-request-options.js";
import { SimEcsSdkCommandRouter } from "./sdk/sim-ecs-sdk-command-router.js";
import { SimEcsCommands } from "./sim-ecs-commands.js";
import type { SimEcsProperties } from "./sim-ecs-properties.js";

/**
 * Simulated ECS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Clusters, task definitions and services are scoped to an account and region,
 * as they are on real AWS: their ARNs name the region, and a cluster name is
 * unique within one account and region rather than globally.
 *
 * A task runs the handlers bound to the containers its task definition
 * declares. Nothing else runs: Yulin never looks inside a container image, so
 * a container with no binding is recorded as not simulated rather than
 * failing anything.
 */
export class SimEcs {
  private readonly commands: SimEcsCommands;
  private readonly sdkRouter = new SimEcsSdkCommandRouter(this);

  constructor(properties: SimEcsProperties = {}) {
    this.commands = new SimEcsCommands({
      ...properties,
      runAsOwner: properties.runAsOwner ?? this,
    });
  }

  /**
   * Handle a CreateCluster Command from the SDK.
   */
  async createCluster(
    command: simEcsCommands.SimCreateClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimCreateClusterCommandOutput> {
    return await this.commands.createCluster.handle(command, options);
  }

  /**
   * Handle a DescribeClusters Command from the SDK.
   */
  async describeClusters(
    command: simEcsCommands.SimDescribeClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeClustersCommandOutput> {
    return await this.commands.describeClusters.handle(command, options);
  }

  /**
   * Handle a DeleteCluster Command from the SDK.
   */
  async deleteCluster(
    command: simEcsCommands.SimDeleteClusterCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDeleteClusterCommandOutput> {
    return await this.commands.deleteCluster.handle(command, options);
  }

  /**
   * Handle a ListClusters Command from the SDK.
   */
  async listClusters(
    command: simEcsCommands.SimListClustersCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListClustersCommandOutput> {
    return await this.commands.listClusters.handle(command, options);
  }

  /**
   * Handle a RegisterTaskDefinition Command from the SDK.
   */
  async registerTaskDefinition(
    command: simEcsCommands.SimRegisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimRegisterTaskDefinitionCommandOutput> {
    return await this.commands.registerTaskDefinition.handle(command, options);
  }

  /**
   * Handle a DeregisterTaskDefinition Command from the SDK.
   */
  async deregisterTaskDefinition(
    command: simEcsCommands.SimDeregisterTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDeregisterTaskDefinitionCommandOutput> {
    return await this.commands.deregisterTaskDefinition.handle(
      command,
      options,
    );
  }

  /**
   * Handle a DescribeTaskDefinition Command from the SDK.
   */
  async describeTaskDefinition(
    command: simEcsCommands.SimDescribeTaskDefinitionCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeTaskDefinitionCommandOutput> {
    return await this.commands.describeTaskDefinition.handle(command, options);
  }

  /**
   * Handle a ListTaskDefinitions Command from the SDK.
   */
  async listTaskDefinitions(
    command: simEcsCommands.SimListTaskDefinitionsCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTaskDefinitionsCommandOutput> {
    return await this.commands.listTaskDefinitions.handle(command, options);
  }

  /**
   * Handle a ListTaskDefinitionFamilies Command from the SDK.
   */
  async listTaskDefinitionFamilies(
    command: simEcsCommands.SimListTaskDefinitionFamiliesCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTaskDefinitionFamiliesCommandOutput> {
    return await this.commands.listTaskDefinitionFamilies.handle(
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
    return await this.commands.runTask.handle(command, options);
  }

  /**
   * Handle a DescribeTasks Command from the SDK.
   */
  async describeTasks(
    command: simEcsCommands.SimDescribeTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeTasksCommandOutput> {
    return await this.commands.describeTasks.handle(command, options);
  }

  /**
   * Handle a ListTasks Command from the SDK.
   */
  async listTasks(
    command: simEcsCommands.SimListTasksCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimListTasksCommandOutput> {
    return await this.commands.listTasks.handle(command, options);
  }

  /**
   * Handle a StopTask Command from the SDK.
   */
  async stopTask(
    command: simEcsCommands.SimStopTaskCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimStopTaskCommandOutput> {
    return await this.commands.stopTask.handle(command, options);
  }

  /**
   * Handle a CreateService Command from the SDK.
   */
  async createService(
    command: simEcsCommands.SimCreateServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimCreateServiceCommandOutput> {
    return await this.commands.createService.handle(command, options);
  }

  /**
   * Handle an UpdateService Command from the SDK.
   */
  async updateService(
    command: simEcsCommands.SimUpdateServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimUpdateServiceCommandOutput> {
    return await this.commands.updateService.handle(command, options);
  }

  /**
   * Handle a DescribeServices Command from the SDK.
   */
  async describeServices(
    command: simEcsCommands.SimDescribeServicesCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDescribeServicesCommandOutput> {
    return await this.commands.describeServices.handle(command, options);
  }

  /**
   * Handle a DeleteService Command from the SDK.
   */
  async deleteService(
    command: simEcsCommands.SimDeleteServiceCommand,
    options?: SimEcsRequestOptions,
  ): Promise<simEcsCommands.SimDeleteServiceCommandOutput> {
    return await this.commands.deleteService.handle(command, options);
  }

  /**
   * Stop everything the services in this scope are keeping running.
   *
   * A service is the one thing simulated ECS keeps running rather than runs and
   * finishes, so this is what a simulated environment being finished with comes
   * down to here: every service's tasks stop, and nothing is left scheduled.
   * The services themselves stay as they were, describable with the desired
   * count they had.
   *
   * Closing again does nothing again, since the second time round there is
   * nothing running to stop.
   */
  close(): void {
    this.commands.closeServices();
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
    this.commands.bindings.add(binding);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

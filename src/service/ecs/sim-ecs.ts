import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimEcsContainerBinding } from "./bind/sim-ecs-container-binding.type.js";
import { SimEcsCfnResourceFactory } from "./cfn/sim-ecs-cfn-resource-factory.js";
import type { SimEcsCluster } from "./cluster/sim-ecs-cluster.js";
import type * as simEcsCommands from "./command/sim-ecs-command.types.js";
import type { SimEcsRequestOptions } from "./command/sim-ecs-request-options.js";
import { SimEcsSdkCommandRouter } from "./sdk/sim-ecs-sdk-command-router.js";
import type { SimEcsContainerServer } from "./service/serve/sim-ecs-container-server.js";
import type { SimEcsService } from "./service/sim-ecs-service.js";
import { SimEcsCommands } from "./sim-ecs-commands.js";
import type { SimEcsProperties } from "./sim-ecs-properties.js";
import type { SimEcsTaskDefinition } from "./task-definition/sim-ecs-task-definition.js";

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
   * down to: every service's tasks stop, leaving the target groups they were
   * registered into, and nothing is left scheduled, while the services stay
   * describable with the desired count they had.
   */
  close(): void {
    this.commands.closeServices();
  }

  /**
   * Bind a real in-process handler to a container a task definition declares.
   *
   * The container is named either by its family and container name or by the
   * repository its image comes from, as `SimEcsContainerBinding` shows. A task
   * run from that definition runs the bound handler in this process, with the
   * container's environment variables and the task Role.
   *
   * A container that consumes a queue declares `consumes` instead of `run`,
   * with a `queueUrl` and a `handler` for a batch of messages: Yulin drives the
   * polling loop and the binding supplies its body. One behind a load balancer
   * declares `http` instead, and its handler answers each request routed to it.
   * Both are called as the task Role while a service is running the container.
   *
   * Bindings belong to the Account and Region they were made in, as the task
   * definitions they target do, and can be made before or after the task
   * definition is registered.
   */
  bindContainer(binding: SimEcsContainerBinding): void {
    this.commands.bindings.add(binding);
  }

  /**
   * The cluster of this name, whether it is active or deleted.
   *
   * A lookup rather than an operation, for a test or a CloudFormation Resource
   * that needs the thing itself. An identifier nothing holds is refused, here
   * and in the two lookups below, since the caller asked for the thing rather
   * than for whether there is one.
   */
  cluster(clusterName: string): SimEcsCluster {
    return this.commands.lookup.cluster(clusterName);
  }

  /**
   * The task definition revision a family, `family:revision` or ARN names. A
   * family on its own means its latest active revision, as it does elsewhere.
   */
  taskDefinition(identifier: string): SimEcsTaskDefinition {
    return this.commands.lookup.taskDefinition(identifier);
  }

  /**
   * The service a name in a cluster, or a full service ARN, names, active or
   * deleted. A name given without a cluster is looked for in the `default` one.
   */
  service(identifier: string, clusterName?: string): SimEcsService {
    return this.commands.lookup.service(identifier, clusterName);
  }

  /**
   * The container of a running service that answers for a target group.
   *
   * This is how a request routed to a target group reaches the handler bound to
   * a service's container. It answers with nothing where nothing can serve the
   * request: no active service registered into the group, or one whose
   * containers are none of them bound to an HTTP handler.
   */
  servingContainer(targetGroupArn: string): SimEcsContainerServer | undefined {
    return this.commands.servingContainer(targetGroupArn);
  }

  /** Get this service's CloudFormation Resource factory. */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return new SimEcsCfnResourceFactory({ ecs: this });
  }

  /** Get this service's SDK Command router for SDK client interception. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

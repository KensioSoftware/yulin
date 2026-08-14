import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimEcsClusterArn } from "./cluster/sim-ecs-cluster-arn.js";
import { SimEcsClusterStore } from "./cluster/sim-ecs-cluster-store.js";
import { SimEcsAuthorizer } from "./command/authorize/sim-ecs-authorizer.js";
import { CreateClusterCommandHandler } from "./command/create-cluster/create-cluster.handler.js";
import { DeleteClusterCommandHandler } from "./command/delete-cluster/delete-cluster.handler.js";
import { DeregisterTaskDefinitionCommandHandler } from "./command/deregister-task-definition/deregister-task-definition.handler.js";
import { DescribeClustersCommandHandler } from "./command/describe-clusters/describe-clusters.handler.js";
import { DescribeTaskDefinitionCommandHandler } from "./command/describe-task-definition/describe-task-definition.handler.js";
import { ListClustersCommandHandler } from "./command/list-clusters/list-clusters.handler.js";
import { ListTaskDefinitionFamiliesCommandHandler } from "./command/list-task-definition-families/list-task-definition-families.handler.js";
import { ListTaskDefinitionsCommandHandler } from "./command/list-task-definitions/list-task-definitions.handler.js";
import { RegisterTaskDefinitionCommandHandler } from "./command/register-task-definition/register-task-definition.handler.js";
import type * as simEcsCommands from "./command/sim-ecs-command.types.js";
import type { SimEcsRequestOptions } from "./command/sim-ecs-request-options.js";
import { SimEcsSdkCommandRouter } from "./sdk/sim-ecs-sdk-command-router.js";
import { SimEcsTaskDefinitionArn } from "./task-definition/sim-ecs-task-definition-arn.js";
import { SimEcsTaskDefinitionStore } from "./task-definition/sim-ecs-task-definition-store.js";

interface SimEcsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated ECS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Clusters and task definitions are scoped to an account and region, as they
 * are on real AWS: both ARNs name the region, and a cluster name is unique
 * within one account and region rather than globally.
 *
 * Nothing runs here yet. This is the state ECS holds, which is what everything
 * that will run reads from.
 */
export class SimEcs {
  private readonly clusters = new SimEcsClusterStore();
  private readonly taskDefinitions = new SimEcsTaskDefinitionStore();

  private readonly createClusterCommand: CreateClusterCommandHandler;
  private readonly describeClustersCommand: DescribeClustersCommandHandler;
  private readonly deleteClusterCommand: DeleteClusterCommandHandler;
  private readonly listClustersCommand: ListClustersCommandHandler;
  private readonly registerTaskDefinitionCommand: RegisterTaskDefinitionCommandHandler;
  private readonly deregisterTaskDefinitionCommand: DeregisterTaskDefinitionCommandHandler;
  private readonly describeTaskDefinitionCommand: DescribeTaskDefinitionCommandHandler;
  private readonly listTaskDefinitionsCommand: ListTaskDefinitionsCommandHandler;
  private readonly listTaskDefinitionFamiliesCommand: ListTaskDefinitionFamiliesCommandHandler;
  private readonly sdkRouter = new SimEcsSdkCommandRouter(this);

  constructor(properties: SimEcsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimEcsAuthorizer({ iam });
    const clusterContext = {
      clusters: this.clusters,
      clusterArn: new SimEcsClusterArn(accountRegionScope),
      authorizer,
      background,
    };
    const taskDefinitionContext = {
      taskDefinitions: this.taskDefinitions,
      taskDefinitionArn: new SimEcsTaskDefinitionArn(accountRegionScope),
      accountRegionScope,
      authorizer,
      background,
    };

    this.createClusterCommand = new CreateClusterCommandHandler(clusterContext);
    this.describeClustersCommand = new DescribeClustersCommandHandler(
      clusterContext,
    );
    this.deleteClusterCommand = new DeleteClusterCommandHandler(clusterContext);
    this.listClustersCommand = new ListClustersCommandHandler(clusterContext);
    this.registerTaskDefinitionCommand =
      new RegisterTaskDefinitionCommandHandler(taskDefinitionContext);
    this.deregisterTaskDefinitionCommand =
      new DeregisterTaskDefinitionCommandHandler(taskDefinitionContext);
    this.describeTaskDefinitionCommand =
      new DescribeTaskDefinitionCommandHandler(taskDefinitionContext);
    this.listTaskDefinitionsCommand = new ListTaskDefinitionsCommandHandler(
      taskDefinitionContext,
    );
    this.listTaskDefinitionFamiliesCommand =
      new ListTaskDefinitionFamiliesCommandHandler(taskDefinitionContext);
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
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

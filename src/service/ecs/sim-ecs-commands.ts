import { BackgroundTasks } from "../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../aws/caller/sim-aws-run-as-context.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimIamAllowAllAuth } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimEcsContainerBindings } from "./bind/sim-ecs-container-bindings.js";
import { SimEcsUnreachableConsumerQueues } from "./service/consume/sim-ecs-consumer-queues.js";
import { SimEcsUnreachableTargetGroups } from "./service/load-balancer/sim-ecs-target-groups.js";
import type { SimEcsTargetGroupContainers } from "./service/serve/sim-ecs-target-group-containers.js";
import type { SimEcsContainerServer } from "./service/serve/sim-ecs-container-server.js";
import { SimEcsClusterStore } from "./cluster/sim-ecs-cluster-store.js";
import { SimEcsAuthorizer } from "./command/authorize/sim-ecs-authorizer.js";
import { SimEcsCommandContexts } from "./command/sim-ecs-command-contexts.js";
import { CreateClusterCommandHandler } from "./command/create-cluster/create-cluster.handler.js";
import { CreateServiceCommandHandler } from "./command/create-service/create-service.handler.js";
import { DeleteClusterCommandHandler } from "./command/delete-cluster/delete-cluster.handler.js";
import { DeleteServiceCommandHandler } from "./command/delete-service/delete-service.handler.js";
import { DeregisterTaskDefinitionCommandHandler } from "./command/deregister-task-definition/deregister-task-definition.handler.js";
import { DescribeClustersCommandHandler } from "./command/describe-clusters/describe-clusters.handler.js";
import { DescribeServicesCommandHandler } from "./command/describe-services/describe-services.handler.js";
import { DescribeTaskDefinitionCommandHandler } from "./command/describe-task-definition/describe-task-definition.handler.js";
import { DescribeTasksCommandHandler } from "./command/describe-tasks/describe-tasks.handler.js";
import { ListClustersCommandHandler } from "./command/list-clusters/list-clusters.handler.js";
import { ListTaskDefinitionFamiliesCommandHandler } from "./command/list-task-definition-families/list-task-definition-families.handler.js";
import { ListTaskDefinitionsCommandHandler } from "./command/list-task-definitions/list-task-definitions.handler.js";
import { ListTasksCommandHandler } from "./command/list-tasks/list-tasks.handler.js";
import { RegisterTaskDefinitionCommandHandler } from "./command/register-task-definition/register-task-definition.handler.js";
import { RunTaskCommandHandler } from "./command/run-task/run-task.handler.js";
import { StopTaskCommandHandler } from "./command/stop-task/stop-task.handler.js";
import { UpdateServiceCommandHandler } from "./command/update-service/update-service.handler.js";
import type { SimEcsServiceTasks } from "./service/run/sim-ecs-service-tasks.js";
import { SimEcsServiceStore } from "./service/sim-ecs-service-store.js";
import { SimEcsLookup } from "./sim-ecs-lookup.js";
import type { SimEcsProperties } from "./sim-ecs-properties.js";
import { SimEcsUnreachableSecretStores } from "./task/run/secret/sim-ecs-secret-stores.js";
import { SimEcsTaskStore } from "./task/sim-ecs-task-store.js";
import { SimEcsTaskDefinitionStore } from "./task-definition/sim-ecs-task-definition-store.js";

/**
 * What the handlers of one simulated ECS scope are built with.
 *
 * The owner a task Role runs as is settled by the facade, which is its own
 * owner when nothing else made it, so it arrives here already decided.
 */
interface SimEcsCommandsProperties extends SimEcsProperties {
  readonly runAsOwner: SimAwsRunAsOwner;
}

/**
 * Why a service's tasks stopped when the simulated environment was closed.
 */
const closedReason = "Task stopped by the simulated environment closing.";

/**
 * The state and command handlers of one simulated ECS scope.
 *
 * Everything simulated ECS holds is built here, so the `SimEcs` facade stays a
 * delegation to a handler per operation. The stores are private because nothing
 * outside a handler reads them; the bindings are not, because binding a
 * container is something a test does directly.
 */
export class SimEcsCommands {
  public readonly bindings = new SimEcsContainerBindings();

  public readonly createCluster: CreateClusterCommandHandler;
  public readonly describeClusters: DescribeClustersCommandHandler;
  public readonly deleteCluster: DeleteClusterCommandHandler;
  public readonly listClusters: ListClustersCommandHandler;
  public readonly registerTaskDefinition: RegisterTaskDefinitionCommandHandler;
  public readonly deregisterTaskDefinition: DeregisterTaskDefinitionCommandHandler;
  public readonly describeTaskDefinition: DescribeTaskDefinitionCommandHandler;
  public readonly listTaskDefinitions: ListTaskDefinitionsCommandHandler;
  public readonly listTaskDefinitionFamilies: ListTaskDefinitionFamiliesCommandHandler;
  public readonly runTask: RunTaskCommandHandler;
  public readonly describeTasks: DescribeTasksCommandHandler;
  public readonly listTasks: ListTasksCommandHandler;
  public readonly stopTask: StopTaskCommandHandler;
  public readonly createService: CreateServiceCommandHandler;
  public readonly updateService: UpdateServiceCommandHandler;
  public readonly describeServices: DescribeServicesCommandHandler;
  public readonly deleteService: DeleteServiceCommandHandler;

  public readonly lookup: SimEcsLookup;

  private readonly clusters = new SimEcsClusterStore();
  private readonly taskDefinitions = new SimEcsTaskDefinitionStore();
  private readonly services = new SimEcsServiceStore();
  private readonly serviceTasks: SimEcsServiceTasks;
  private readonly targetGroupContainers: SimEcsTargetGroupContainers;

  constructor(properties: SimEcsCommandsProperties) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      runAsOwner,
      secretStores = new SimEcsUnreachableSecretStores(),
      consumerQueues = new SimEcsUnreachableConsumerQueues(),
      targetGroups = new SimEcsUnreachableTargetGroups(),
    } = properties;

    const contexts = new SimEcsCommandContexts({
      accountRegionScope,
      authorizer: new SimEcsAuthorizer({ iam }),
      background,
      runAsOwner,
      clusters: this.clusters,
      taskDefinitions: this.taskDefinitions,
      tasks: new SimEcsTaskStore(),
      services: this.services,
      bindings: this.bindings,
      secretStores,
      consumerQueues,
      targetGroups,
    });
    const { cluster, taskDefinition, task, service } = contexts;

    this.serviceTasks = service.serviceTasks;
    this.targetGroupContainers = contexts.targetGroupContainers;
    this.lookup = new SimEcsLookup({
      accountRegionScope,
      clusters: this.clusters,
      taskDefinitions: this.taskDefinitions,
      services: this.services,
      serviceArn: service.serviceArn,
    });

    this.createCluster = new CreateClusterCommandHandler(cluster);
    this.describeClusters = new DescribeClustersCommandHandler(cluster);
    this.deleteCluster = new DeleteClusterCommandHandler(cluster);
    this.listClusters = new ListClustersCommandHandler(cluster);

    this.registerTaskDefinition = new RegisterTaskDefinitionCommandHandler(
      taskDefinition,
    );
    this.deregisterTaskDefinition = new DeregisterTaskDefinitionCommandHandler(
      taskDefinition,
    );
    this.describeTaskDefinition = new DescribeTaskDefinitionCommandHandler(
      taskDefinition,
    );
    this.listTaskDefinitions = new ListTaskDefinitionsCommandHandler(
      taskDefinition,
    );
    this.listTaskDefinitionFamilies =
      new ListTaskDefinitionFamiliesCommandHandler(taskDefinition);

    this.runTask = new RunTaskCommandHandler(contexts.runTask);
    this.describeTasks = new DescribeTasksCommandHandler(task);
    this.listTasks = new ListTasksCommandHandler(task);
    this.stopTask = new StopTaskCommandHandler(task);

    this.createService = new CreateServiceCommandHandler(service);
    this.updateService = new UpdateServiceCommandHandler(service);
    this.describeServices = new DescribeServicesCommandHandler(service);
    this.deleteService = new DeleteServiceCommandHandler(service);
  }

  /**
   * The container answering for a target group, where a service registered one.
   */
  servingContainer(targetGroupArn: string): SimEcsContainerServer | undefined {
    return this.targetGroupContainers.find(targetGroupArn);
  }

  /**
   * Stop everything the services in this scope are keeping running.
   *
   * The services themselves stay as they were, describable with the desired
   * count they had. Doing it again does nothing again, since the second time
   * round there is nothing running to stop.
   */
  closeServices(): void {
    for (const service of this.services.active()) {
      this.serviceTasks.stopAll(service, closedReason);
    }
  }
}

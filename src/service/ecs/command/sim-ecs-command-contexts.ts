import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEcsContainerBindings } from "../bind/sim-ecs-container-bindings.js";
import { SimEcsClusterArn } from "../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsClusterStore } from "../cluster/sim-ecs-cluster-store.js";
import { SimEcsServiceConsumers } from "../service/consume/sim-ecs-service-consumers.js";
import { SimEcsServiceTargets } from "../service/load-balancer/sim-ecs-service-targets.js";
import type { SimEcsTargetGroups } from "../service/load-balancer/sim-ecs-target-groups.js";
import { SimEcsServiceTasks } from "../service/run/sim-ecs-service-tasks.js";
import { SimEcsServiceServers } from "../service/serve/sim-ecs-service-servers.js";
import { SimEcsTargetGroupContainers } from "../service/serve/sim-ecs-target-group-containers.js";
import { SimEcsServiceArn } from "../service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "../service/sim-ecs-service-store.js";
import type { SimSqsPollQueues } from "../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimEcsSecretStores } from "../task/run/secret/sim-ecs-secret-stores.js";
import { SimEcsTaskArn } from "../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../task/sim-ecs-task-store.js";
import { SimEcsTaskDefinitionArn } from "../task-definition/sim-ecs-task-definition-arn.js";
import type { SimEcsTaskDefinitionStore } from "../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsAuthorizer } from "./authorize/sim-ecs-authorizer.js";
import type {
  SimEcsClusterCommandContext,
  SimEcsRunTaskCommandContext,
  SimEcsServiceCommandContext,
  SimEcsTaskCommandContext,
  SimEcsTaskDefinitionCommandContext,
} from "./sim-ecs-command-context.js";

interface SimEcsCommandContextsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly authorizer: SimEcsAuthorizer;
  readonly background: BackgroundScheduler;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly clusters: SimEcsClusterStore;
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
  readonly tasks: SimEcsTaskStore;
  readonly services: SimEcsServiceStore;
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
  readonly consumerQueues: SimSqsPollQueues;
  readonly targetGroups: SimEcsTargetGroups;
}

/**
 * What each kind of simulated ECS command handler is built with.
 *
 * The ARN builders are made once here rather than per handler, and the four
 * contexts overlap because the operations do: a task operation needs the
 * clusters a cluster operation needs, and running a task needs everything.
 * Building them in one place is what keeps the service facade a delegation.
 *
 * The containers a target group reaches are built here too, though no command
 * handler takes them. They read the same services and the same running
 * containers the service operations work on, and building them anywhere else
 * would be a second set of both.
 */
export class SimEcsCommandContexts {
  public readonly cluster: SimEcsClusterCommandContext;
  public readonly taskDefinition: SimEcsTaskDefinitionCommandContext;
  public readonly task: SimEcsTaskCommandContext;
  public readonly runTask: SimEcsRunTaskCommandContext;
  public readonly service: SimEcsServiceCommandContext;
  public readonly targetGroupContainers: SimEcsTargetGroupContainers;

  constructor(properties: SimEcsCommandContextsProperties) {
    const { accountRegionScope, authorizer, background } = properties;
    const shared = { authorizer, background };
    const servers = new SimEcsServiceServers();
    const serviceTargets = new SimEcsServiceTargets({
      targetGroups: properties.targetGroups,
    });

    this.cluster = {
      ...shared,
      clusters: properties.clusters,
      clusterArn: new SimEcsClusterArn(accountRegionScope),
    };
    this.taskDefinition = {
      ...shared,
      accountRegionScope,
      taskDefinitions: properties.taskDefinitions,
      taskDefinitionArn: new SimEcsTaskDefinitionArn(accountRegionScope),
    };
    this.task = {
      ...shared,
      clusters: properties.clusters,
      clusterArn: this.cluster.clusterArn,
      tasks: properties.tasks,
      taskArn: new SimEcsTaskArn(accountRegionScope),
    };
    this.runTask = {
      ...this.task,
      accountRegionScope,
      taskDefinitions: properties.taskDefinitions,
      bindings: properties.bindings,
      runAsOwner: properties.runAsOwner,
      secretStores: properties.secretStores,
    };
    this.service = {
      ...this.task,
      accountRegionScope,
      taskDefinitions: properties.taskDefinitions,
      services: properties.services,
      serviceArn: new SimEcsServiceArn(accountRegionScope),
      serviceTargets,
      serviceTasks: new SimEcsServiceTasks({
        tasks: properties.tasks,
        taskArn: this.task.taskArn,
        bindings: properties.bindings,
        secretStores: properties.secretStores,
        regionName: accountRegionScope.regionName,
        runAsOwner: properties.runAsOwner,
        consumers: new SimEcsServiceConsumers({
          queues: properties.consumerQueues,
          runAsOwner: properties.runAsOwner,
          background,
        }),
        servers,
        targets: serviceTargets,
        background,
      }),
    };
    this.targetGroupContainers = new SimEcsTargetGroupContainers({
      services: properties.services,
      servers,
    });
  }
}

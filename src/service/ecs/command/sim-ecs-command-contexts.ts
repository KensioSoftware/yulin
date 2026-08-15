import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEcsContainerBindings } from "../bind/sim-ecs-container-bindings.js";
import { SimEcsClusterArn } from "../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsClusterStore } from "../cluster/sim-ecs-cluster-store.js";
import type { SimEcsSecretStores } from "../task/run/secret/sim-ecs-secret-stores.js";
import { SimEcsTaskArn } from "../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../task/sim-ecs-task-store.js";
import { SimEcsTaskDefinitionArn } from "../task-definition/sim-ecs-task-definition-arn.js";
import type { SimEcsTaskDefinitionStore } from "../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsAuthorizer } from "./authorize/sim-ecs-authorizer.js";
import type {
  SimEcsClusterCommandContext,
  SimEcsRunTaskCommandContext,
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
  readonly bindings: SimEcsContainerBindings;
  readonly secretStores: SimEcsSecretStores;
}

/**
 * What each kind of simulated ECS command handler is built with.
 *
 * The ARN builders are made once here rather than per handler, and the four
 * contexts overlap because the operations do: a task operation needs the
 * clusters a cluster operation needs, and running a task needs everything.
 * Building them in one place is what keeps the service facade a delegation.
 */
export class SimEcsCommandContexts {
  public readonly cluster: SimEcsClusterCommandContext;
  public readonly taskDefinition: SimEcsTaskDefinitionCommandContext;
  public readonly task: SimEcsTaskCommandContext;
  public readonly runTask: SimEcsRunTaskCommandContext;

  constructor(properties: SimEcsCommandContextsProperties) {
    const { accountRegionScope, authorizer, background } = properties;
    const shared = { authorizer, background };

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
  }
}

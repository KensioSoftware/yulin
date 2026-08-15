import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEcsContainerBindings } from "../bind/sim-ecs-container-bindings.js";
import type { SimEcsClusterArn } from "../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsClusterStore } from "../cluster/sim-ecs-cluster-store.js";
import type { SimEcsServiceTargets } from "../service/load-balancer/sim-ecs-service-targets.js";
import type { SimEcsServiceTasks } from "../service/run/sim-ecs-service-tasks.js";
import type { SimEcsServiceArn } from "../service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "../service/sim-ecs-service-store.js";
import type { SimEcsSecretStores } from "../task/run/secret/sim-ecs-secret-stores.js";
import type { SimEcsTaskArn } from "../task/sim-ecs-task-arn.js";
import type { SimEcsTaskStore } from "../task/sim-ecs-task-store.js";
import type { SimEcsTaskDefinitionArn } from "../task-definition/sim-ecs-task-definition-arn.js";
import type { SimEcsTaskDefinitionStore } from "../task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsAuthorizer } from "./authorize/sim-ecs-authorizer.js";

/**
 * What every simulated ECS command handler is built with.
 *
 * The scheduler is here because every operation sequences on it before it
 * touches state, and the authorizer because every operation authorizes. The
 * two halves below add the state each kind of operation works on.
 */
interface SimEcsCommandCollaborators {
  readonly authorizer: SimEcsAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * What a simulated ECS cluster command handler is built with.
 */
export interface SimEcsClusterCommandContext extends SimEcsCommandCollaborators {
  readonly clusters: SimEcsClusterStore;
  readonly clusterArn: SimEcsClusterArn;
}

/**
 * What a simulated ECS task definition command handler is built with.
 */
export interface SimEcsTaskDefinitionCommandContext extends SimEcsCommandCollaborators {
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
  readonly taskDefinitionArn: SimEcsTaskDefinitionArn;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * What a simulated ECS task command handler is built with.
 *
 * The cluster store is here because every task operation takes a cluster, and
 * means the default one when a request names none.
 */
export interface SimEcsTaskCommandContext extends SimEcsCommandCollaborators {
  readonly clusters: SimEcsClusterStore;
  readonly clusterArn: SimEcsClusterArn;
  readonly tasks: SimEcsTaskStore;
  readonly taskArn: SimEcsTaskArn;
}

/**
 * What the simulated ECS RunTask handler is built with.
 *
 * Running a task is the one operation that reaches everything: the task
 * definition it runs, the bindings that say what its containers do, the stores
 * its container secrets are pulled from, and the SimAws instance whose ambient
 * caller the task Role becomes while they run.
 */
export interface SimEcsRunTaskCommandContext extends SimEcsTaskCommandContext {
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly bindings: SimEcsContainerBindings;
  readonly runAsOwner: SimAwsRunAsOwner;
  readonly secretStores: SimEcsSecretStores;
}

/**
 * What a simulated ECS service command handler is built with.
 *
 * A service operation reaches the task state a task operation does, because a
 * service is a number of tasks kept running, and the task definitions because
 * that is what it keeps running. What starts and stops those tasks is built
 * once and shared, since the service that is closed holds the same tasks the
 * one that was updated does.
 */
export interface SimEcsServiceCommandContext extends SimEcsTaskCommandContext {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
  readonly services: SimEcsServiceStore;
  readonly serviceArn: SimEcsServiceArn;
  readonly serviceTasks: SimEcsServiceTasks;
  readonly serviceTargets: SimEcsServiceTargets;
}

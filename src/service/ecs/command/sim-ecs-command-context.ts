import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEcsClusterArn } from "../cluster/sim-ecs-cluster-arn.js";
import type { SimEcsClusterStore } from "../cluster/sim-ecs-cluster-store.js";
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

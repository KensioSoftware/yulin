import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsService } from "../sim-ecs-service.js";

/**
 * What a service is keeping running, and the revision it is running.
 *
 * The revision travels with the service rather than being read back from it,
 * because an update carries the one the service is moving to while the service
 * is still on the one it had.
 */
export interface SimEcsServiceDeployment {
  readonly service: SimEcsService;
  readonly cluster: SimEcsCluster;
  readonly taskDefinition: SimEcsTaskDefinition;
}

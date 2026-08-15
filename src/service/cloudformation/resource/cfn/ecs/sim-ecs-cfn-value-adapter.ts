import { SimEcsCluster } from "../../../../ecs/cluster/sim-ecs-cluster.js";
import { SimEcsService } from "../../../../ecs/service/sim-ecs-service.js";
import { SimEcsTaskDefinition } from "../../../../ecs/task-definition/sim-ecs-task-definition.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimEcsClusterCfn } from "./sim-ecs-cluster-cfn.js";
import { SimEcsServiceCfn } from "./sim-ecs-service-cfn.js";
import { SimEcsTaskDefinitionCfn } from "./sim-ecs-task-definition-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated ECS Resource.
 */
export function ecsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::ECS::Cluster" &&
    properties.simResource instanceof SimEcsCluster
  ) {
    return new SimEcsClusterCfn({ cluster: properties.simResource });
  }

  if (
    properties.type === "AWS::ECS::TaskDefinition" &&
    properties.simResource instanceof SimEcsTaskDefinition
  ) {
    return new SimEcsTaskDefinitionCfn({
      taskDefinition: properties.simResource,
    });
  }

  if (
    properties.type === "AWS::ECS::Service" &&
    properties.simResource instanceof SimEcsService
  ) {
    return new SimEcsServiceCfn({ service: properties.simResource });
  }

  return undefined;
}

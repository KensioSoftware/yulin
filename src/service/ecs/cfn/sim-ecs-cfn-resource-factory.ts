import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimEcsCluster } from "../cluster/sim-ecs-cluster.js";
import type { SimEcsTaskDefinition } from "../task-definition/sim-ecs-task-definition.js";
import type { SimEcs } from "../sim-ecs.js";
import { SimCfnEcsClusterCreator } from "./cluster/sim-cfn-ecs-cluster-creator.js";
import { SimCfnEcsTaskDefinitionCreator } from "./task-definition/sim-cfn-ecs-task-definition-creator.js";

interface SimEcsCfnResourceFactoryProperties {
  readonly ecs: SimEcs;
}

/**
 * CloudFormation Resource factory for simulated ECS resources.
 *
 * `AWS::ECS::Cluster` and `AWS::ECS::TaskDefinition` are the two Resource
 * types a stack has to have before anything else about ECS can be deployed:
 * one is where tasks run, and the other is what they run. `AWS::ECS::Service`
 * follows separately, and until it does a template declaring one deploys with
 * the service recorded as unsupported.
 */
export class SimEcsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly clusterCreator: SimCfnEcsClusterCreator;
  private readonly taskDefinitionCreator: SimCfnEcsTaskDefinitionCreator;

  constructor(properties: SimEcsCfnResourceFactoryProperties) {
    this.clusterCreator = new SimCfnEcsClusterCreator({ ecs: properties.ecs });
    this.taskDefinitionCreator = new SimCfnEcsTaskDefinitionCreator({
      ecs: properties.ecs,
    });
  }

  /**
   * Create a simulated ECS resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "Cluster": {
        return await this.clusterCreator.create(resource, properties);
      }
      case "TaskDefinition": {
        return await this.taskDefinitionCreator.create(
          resource,
          properties,
          context.bindings,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim ECS CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated ECS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Cluster": {
        await this.clusterCreator.delete(
          simCfnEcsCreatedResource<SimEcsCluster>(resource, "cluster"),
        );

        return;
      }
      case "TaskDefinition": {
        await this.taskDefinitionCreator.delete(
          simCfnEcsCreatedResource<SimEcsTaskDefinition>(
            resource,
            "task definition",
          ),
        );

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim ECS CloudFormation Resource ${resourceTypeName} ` +
            `deletion`,
        );
      }
    }
  }
}

/**
 * The simulated resource a Resource created, which a teardown reaches it by.
 */
function simCfnEcsCreatedResource<T extends object>(
  resource: SimCfnResource,
  described: string,
): T {
  const created = resource.simResource as T | undefined;

  assertDefined(
    created,
    `sim ECS ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return created;
}

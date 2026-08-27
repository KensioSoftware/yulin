import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { simCfnEcsCreatedResource } from "./sim-cfn-ecs-created-resource.js";
import type { SimEcsCluster } from "../cluster/sim-ecs-cluster.js";
import type { SimEcsService } from "../service/sim-ecs-service.js";
import type { SimEcsTaskDefinition } from "../task-definition/sim-ecs-task-definition.js";
import type { SimEcs } from "../sim-ecs.js";
import { SimCfnEcsClusterCreator } from "./cluster/sim-cfn-ecs-cluster-creator.js";
import { SimCfnEcsServiceCreator } from "./service/sim-cfn-ecs-service-creator.js";
import { SimCfnEcsTaskDefinitionCreator } from "./task-definition/sim-cfn-ecs-task-definition-creator.js";

interface SimEcsCfnResourceFactoryProperties {
  readonly ecs: SimEcs;
}

/**
 * CloudFormation Resource factory for simulated ECS resources.
 *
 * The three Resource types are the three things ECS is made of: a cluster is
 * where tasks run, a task definition is what they run, and a service is what
 * keeps them running. A stack declaring all three deploys into a simulated
 * service running the revision it registered, which is what an application
 * defined in CloudFormation comes down to.
 */
export class SimEcsCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly clusterCreator: SimCfnEcsClusterCreator;
  private readonly taskDefinitionCreator: SimCfnEcsTaskDefinitionCreator;
  private readonly serviceCreator: SimCfnEcsServiceCreator;

  constructor(properties: SimEcsCfnResourceFactoryProperties) {
    this.clusterCreator = new SimCfnEcsClusterCreator({ ecs: properties.ecs });
    this.taskDefinitionCreator = new SimCfnEcsTaskDefinitionCreator({
      ecs: properties.ecs,
    });
    this.serviceCreator = new SimCfnEcsServiceCreator({ ecs: properties.ecs });
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
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "Cluster": {
        return await this.clusterCreator.create(resource, properties, options);
      }
      case "TaskDefinition": {
        return await this.taskDefinitionCreator.create(
          resource,
          properties,
          context.bindings,
          options,
        );
      }
      case "Service": {
        return await this.serviceCreator.create(resource, properties, options);
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
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "Cluster": {
        await this.clusterCreator.delete(
          simCfnEcsCreatedResource<SimEcsCluster>(resource, "cluster"),
          options,
        );

        return;
      }
      case "TaskDefinition": {
        await this.taskDefinitionCreator.delete(
          simCfnEcsCreatedResource<SimEcsTaskDefinition>(
            resource,
            "task definition",
          ),
          options,
        );

        return;
      }
      case "Service": {
        await this.serviceCreator.delete(
          simCfnEcsCreatedResource<SimEcsService>(resource, "service"),
          options,
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

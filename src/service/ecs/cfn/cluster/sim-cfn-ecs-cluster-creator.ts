import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEcsCluster } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcs } from "../../sim-ecs.js";
import { SimCfnEcsClusterProperties } from "./sim-cfn-ecs-cluster-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnEcsClusterCreatorProperties {
  readonly ecs: SimEcs;
}

/**
 * Creates simulated clusters from AWS::ECS::Cluster Resources.
 *
 * The cluster is created through the ordinary CreateCluster command rather
 * than constructed directly, so a cluster a template deployed is the same
 * thing an SDK caller would have got: the same name validation, and the same
 * answer for a name an active cluster already holds.
 */
export class SimCfnEcsClusterCreator {
  private readonly ecs: SimEcs;

  constructor(properties: SimCfnEcsClusterCreatorProperties) {
    this.ecs = properties.ecs;
  }

  /**
   * Create a cluster from an AWS::ECS::Cluster Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimEcsCluster> {
    const clusterProperties = new SimCfnEcsClusterProperties({
      resource,
      properties,
    });
    const input = clusterProperties.createClusterInput();

    clusterProperties.recordIgnoredProperties();

    await this.ecs.createCluster({ input }, options);

    return this.ecs.cluster(clusterProperties.clusterName());
  }

  /**
   * Delete a cluster created from an AWS::ECS::Cluster Resource.
   *
   * Deleting marks the cluster `INACTIVE` rather than removing it, as
   * `DeleteCluster` does, so something still holding its ARN can find out what
   * became of it after the stack has gone.
   */
  async delete(
    cluster: SimEcsCluster,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.ecs.deleteCluster(
      { input: { cluster: cluster.clusterName } },
      options,
    );
  }
}

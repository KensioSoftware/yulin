import type { SimEcsCluster } from "../../../../ecs/cluster/sim-ecs-cluster.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEcsClusterCfnProperties {
  readonly cluster: SimEcsCluster;
}

/**
 * CloudFormation-facing values for a simulated ECS cluster.
 */
export class SimEcsClusterCfn implements SimCfnResourceValueAdapter {
  private readonly cluster: SimEcsCluster;

  constructor(properties: SimEcsClusterCfnProperties) {
    this.cluster = properties.cluster;
  }

  /**
   * AWS::ECS::Cluster Ref returns the cluster name.
   */
  refValue(): SimCfnTemplateValue {
    return this.cluster.clusterName;
  }

  /**
   * AWS::ECS::Cluster attributes.
   *
   * The ARN is the only one, and it is what a service, a task and an IAM
   * policy all name the cluster by.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName !== "Arn") {
      throw new Error(
        `Unsupported AWS::ECS::Cluster attribute ${attributeName}`,
      );
    }

    return this.cluster.clusterArn;
  }
}

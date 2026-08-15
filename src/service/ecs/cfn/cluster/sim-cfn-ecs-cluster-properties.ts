import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateClusterCommandInput } from "../../command/create-cluster/create-cluster.command.js";
import type { SimEcsClusterSetting } from "../../cluster/sim-ecs-cluster.js";
import type { SimEcsTag } from "../../task-definition/sim-ecs-task-definition-parts.js";
import { SimCfnEcsPropertyReader } from "../property/sim-cfn-ecs-property-reader.js";
import { SimCfnEcsClusterName } from "./sim-cfn-ecs-cluster-name.js";
import { SimCfnEcsClusterPropertyRules } from "./sim-cfn-ecs-cluster-property-rules.js";

interface SimCfnEcsClusterPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ECS::Cluster CloudFormation properties into CreateCluster input.
 *
 * A cluster is the simplest thing ECS has, so this is mostly translation: what
 * the template declared, spelled the way the SDK spells it, and the name
 * CloudFormation would have generated where the template left it out.
 */
export class SimCfnEcsClusterProperties {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnEcsPropertyReader;
  private readonly rules: SimCfnEcsClusterPropertyRules;

  constructor(properties: SimCfnEcsClusterPropertiesProperties) {
    this.resource = properties.resource;
    this.reader = new SimCfnEcsPropertyReader(properties);
    this.rules = new SimCfnEcsClusterPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The CreateCluster input this Resource declares.
   */
  createClusterInput(): SimCreateClusterCommandInput {
    return {
      clusterName: this.clusterName(),
      settings: this.reader.apiList<SimEcsClusterSetting>("ClusterSettings"),
      configuration: this.reader.apiRecord<object>("Configuration"),
      tags: this.reader.apiList<SimEcsTag>("Tags"),
    };
  }

  /**
   * The cluster name.
   *
   * An unnamed cluster is named after the stack and the logical ID, as real
   * CloudFormation names one. It is deliberately not `default`: a template
   * declaring a cluster asks for a cluster of its own, and taking the
   * account's default one would put every unnamed cluster of every stack in
   * the same place.
   */
  clusterName(): string {
    return (
      this.reader.text("ClusterName") ??
      new SimCfnEcsClusterName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value
    );
  }

  /**
   * Record the properties the cluster is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}

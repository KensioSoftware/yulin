import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimElbV2 } from "../sim-elbv2.js";
import type { SimElbV2Stores } from "../sim-elbv2-stores.js";
import { SimCfnElbV2ListenerCreator } from "./listener/sim-cfn-elbv2-listener-creator.js";
import { SimCfnElbV2LoadBalancerCreator } from "./load-balancer/sim-cfn-elbv2-load-balancer-creator.js";
import { SimCfnElbV2ListenerRuleCreator } from "./rule/sim-cfn-elbv2-listener-rule-creator.js";
import { SimCfnElbV2TargetGroupCreator } from "./target-group/sim-cfn-elbv2-target-group-creator.js";
import { SimElbV2CfnResourceDeleter } from "./sim-elbv2-cfn-resource-deleter.js";

interface SimElbV2CfnResourceFactoryProperties {
  readonly elbV2: SimElbV2;
  readonly stores: SimElbV2Stores;
}

/**
 * CloudFormation Resource factory for simulated ELBv2 resources.
 *
 * The four Resource types are the whole of an Application Load Balancer a
 * template declares: where requests arrive, what answers them, and which of
 * them goes where. Each is created through its own ordinary command, so what a
 * stack deploys is what an SDK caller would have created, down to the refusals.
 *
 * `AWS::ElasticLoadBalancingV2::TrustStore` and the Resource types belonging to
 * a network or gateway load balancer are not created, because neither is
 * simulated at all. A stack declaring one deploys with that Resource recorded
 * as unsupported.
 */
export class SimElbV2CfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly loadBalancerCreator: SimCfnElbV2LoadBalancerCreator;
  private readonly targetGroupCreator: SimCfnElbV2TargetGroupCreator;
  private readonly listenerCreator: SimCfnElbV2ListenerCreator;
  private readonly ruleCreator: SimCfnElbV2ListenerRuleCreator;
  private readonly deleter: SimElbV2CfnResourceDeleter;

  constructor(properties: SimElbV2CfnResourceFactoryProperties) {
    this.loadBalancerCreator = new SimCfnElbV2LoadBalancerCreator(properties);
    this.targetGroupCreator = new SimCfnElbV2TargetGroupCreator(properties);
    this.listenerCreator = new SimCfnElbV2ListenerCreator(properties);
    this.ruleCreator = new SimCfnElbV2ListenerRuleCreator(properties);
    this.deleter = new SimElbV2CfnResourceDeleter({
      loadBalancers: this.loadBalancerCreator,
      targetGroups: this.targetGroupCreator,
      listeners: this.listenerCreator,
      rules: this.ruleCreator,
    });
  }

  /**
   * Create a simulated ELBv2 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "LoadBalancer": {
        return await this.loadBalancerCreator.create(resource, properties);
      }
      case "TargetGroup": {
        return await this.targetGroupCreator.create(resource, properties);
      }
      case "Listener": {
        return await this.listenerCreator.create(resource, properties);
      }
      case "ListenerRule": {
        return await this.ruleCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim ELBv2 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated ELBv2 resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource);
  }
}

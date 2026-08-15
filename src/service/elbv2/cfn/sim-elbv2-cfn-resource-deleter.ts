import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimElbV2ListenerRule } from "../listener/rule/sim-elbv2-listener-rule.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2TargetGroup } from "../target-group/sim-elbv2-target-group.js";
import type { SimCfnElbV2ListenerCreator } from "./listener/sim-cfn-elbv2-listener-creator.js";
import type { SimCfnElbV2LoadBalancerCreator } from "./load-balancer/sim-cfn-elbv2-load-balancer-creator.js";
import type { SimCfnElbV2ListenerRuleCreator } from "./rule/sim-cfn-elbv2-listener-rule-creator.js";
import type { SimCfnElbV2TargetGroupCreator } from "./target-group/sim-cfn-elbv2-target-group-creator.js";

interface SimElbV2CfnResourceDeleterProperties {
  readonly loadBalancers: SimCfnElbV2LoadBalancerCreator;
  readonly targetGroups: SimCfnElbV2TargetGroupCreator;
  readonly listeners: SimCfnElbV2ListenerCreator;
  readonly rules: SimCfnElbV2ListenerRuleCreator;
}

/**
 * Removes the simulated ELBv2 resources a stack created.
 *
 * The teardown works in reverse dependency order, so a rule comes down before
 * its listener, a listener before its load balancer, and a target group after
 * everything that forwards to it. That is what makes each of these the plain
 * delete command rather than a cascade written here.
 *
 * It is held apart from the factory because the two dispatch over the same
 * four Resource types and one file doing both is the most complex thing in the
 * service without saying anything either half does not.
 */
export class SimElbV2CfnResourceDeleter {
  private readonly loadBalancers: SimCfnElbV2LoadBalancerCreator;
  private readonly targetGroups: SimCfnElbV2TargetGroupCreator;
  private readonly listeners: SimCfnElbV2ListenerCreator;
  private readonly rules: SimCfnElbV2ListenerRuleCreator;

  constructor(properties: SimElbV2CfnResourceDeleterProperties) {
    this.loadBalancers = properties.loadBalancers;
    this.targetGroups = properties.targetGroups;
    this.listeners = properties.listeners;
    this.rules = properties.rules;
  }

  /**
   * Delete the simulated resource one Resource created.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "LoadBalancer": {
        await this.loadBalancers.delete(
          simCfnElbV2Created<SimElbV2LoadBalancer>(resource, "load balancer"),
        );

        return;
      }
      case "TargetGroup": {
        await this.targetGroups.delete(
          simCfnElbV2Created<SimElbV2TargetGroup>(resource, "target group"),
        );

        return;
      }
      case "Listener": {
        await this.listeners.delete(
          simCfnElbV2Created<SimElbV2Listener>(resource, "listener"),
        );

        return;
      }
      case "ListenerRule": {
        await this.rules.delete(
          simCfnElbV2Created<SimElbV2ListenerRule>(resource, "rule"),
        );

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim ELBv2 CloudFormation Resource ` +
            `${resourceTypeName} deletion`,
        );
      }
    }
  }
}

/**
 * The simulated resource a Resource created, which a teardown reaches it by.
 */
function simCfnElbV2Created<T extends object>(
  resource: SimCfnResource,
  described: string,
): T {
  const created = resource.simResource as T | undefined;

  assertDefined(
    created,
    `sim ELBv2 ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return created;
}

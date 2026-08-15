import { SimElbV2ListenerRule } from "../../../../elbv2/listener/rule/sim-elbv2-listener-rule.js";
import { SimElbV2Listener } from "../../../../elbv2/listener/sim-elbv2-listener.js";
import { SimElbV2LoadBalancer } from "../../../../elbv2/load-balancer/sim-elbv2-load-balancer.js";
import { SimElbV2TargetGroup } from "../../../../elbv2/target-group/sim-elbv2-target-group.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import {
  SimElbV2ListenerCfn,
  SimElbV2ListenerRuleCfn,
} from "./sim-elbv2-listener-cfn.js";
import { SimElbV2LoadBalancerCfn } from "./sim-elbv2-load-balancer-cfn.js";
import { SimElbV2TargetGroupCfn } from "./sim-elbv2-target-group-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated ELBv2 Resource.
 */
export function elbV2ValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { simResource } = properties;

  if (
    properties.type === "AWS::ElasticLoadBalancingV2::LoadBalancer" &&
    simResource instanceof SimElbV2LoadBalancer
  ) {
    return new SimElbV2LoadBalancerCfn({ loadBalancer: simResource });
  }

  if (
    properties.type === "AWS::ElasticLoadBalancingV2::TargetGroup" &&
    simResource instanceof SimElbV2TargetGroup
  ) {
    return new SimElbV2TargetGroupCfn({ targetGroup: simResource });
  }

  if (
    properties.type === "AWS::ElasticLoadBalancingV2::Listener" &&
    simResource instanceof SimElbV2Listener
  ) {
    return new SimElbV2ListenerCfn({ listener: simResource });
  }

  if (
    properties.type === "AWS::ElasticLoadBalancingV2::ListenerRule" &&
    simResource instanceof SimElbV2ListenerRule
  ) {
    return new SimElbV2ListenerRuleCfn({ rule: simResource });
  }

  return undefined;
}

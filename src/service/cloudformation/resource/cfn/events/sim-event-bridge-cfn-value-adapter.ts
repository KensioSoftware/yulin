import { SimEventBus } from "../../../../eventbridge/bus/sim-event-bus.js";
import { SimEventRule } from "../../../../eventbridge/rule/sim-event-rule.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimEventBusCfn } from "./sim-event-bus-cfn.js";
import { SimEventRuleCfn } from "./sim-event-rule-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated EventBridge Resource.
 *
 * Both types answer a `Ref` with their name rather than their ARN, which is
 * unlike most of the simulator's other resources and is what AWS does here.
 */
export function eventBridgeValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Events::EventBus" &&
    properties.simResource instanceof SimEventBus
  ) {
    return new SimEventBusCfn({ bus: properties.simResource });
  }

  if (
    properties.type === "AWS::Events::Rule" &&
    properties.simResource instanceof SimEventRule
  ) {
    return new SimEventRuleCfn({ rule: properties.simResource });
  }

  return undefined;
}

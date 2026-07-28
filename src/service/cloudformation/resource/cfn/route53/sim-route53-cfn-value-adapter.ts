import { SimRoute53HostedZone } from "../../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53HostedZoneCfn } from "./sim-route53-hosted-zone-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated Route 53 Resource.
 */
export function route53ValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Route53::HostedZone" &&
    properties.simResource instanceof SimRoute53HostedZone
  ) {
    return new SimRoute53HostedZoneCfn({ hostedZone: properties.simResource });
  }

  return undefined;
}

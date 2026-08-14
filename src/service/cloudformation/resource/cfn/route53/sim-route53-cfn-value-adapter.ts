import { SimRoute53HostedZone } from "../../../../route53/hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53KeySigningKey } from "../../../../route53/dnssec/sim-route53-key-signing-key.js";
import { SimRoute53DnssecCfn } from "./sim-route53-dnssec-cfn.js";
import { SimRoute53HostedZoneCfn } from "./sim-route53-hosted-zone-cfn.js";
import { SimRoute53KeySigningKeyCfn } from "./sim-route53-key-signing-key-cfn.js";
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

  if (
    properties.type === "AWS::Route53::KeySigningKey" &&
    properties.simResource instanceof SimRoute53KeySigningKey
  ) {
    return new SimRoute53KeySigningKeyCfn({
      keySigningKey: properties.simResource,
    });
  }

  // A DNSSEC Resource creates nothing of its own, so the simulated resource
  // behind it is the zone it turns signing on for.
  if (
    properties.type === "AWS::Route53::DNSSEC" &&
    properties.simResource instanceof SimRoute53HostedZone
  ) {
    return new SimRoute53DnssecCfn({ hostedZone: properties.simResource });
  }

  return undefined;
}

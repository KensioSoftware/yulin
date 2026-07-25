import { findSimRoute53HostedZone } from "../../hosted-zone/find-sim-route53-hosted-zone.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";

/**
 * Finds the Hosted Zone targeted by a ChangeResourceRecordSets command.
 */
export function getChangeResourceRecordSetsHostedZone(
  hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>,
  hostedZoneId: SimRoute53HostedZoneId,
): SimRoute53HostedZone {
  return findSimRoute53HostedZone(hostedZones, hostedZoneId);
}

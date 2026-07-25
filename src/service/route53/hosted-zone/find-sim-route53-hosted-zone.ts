import { SimRoute53NoSuchHostedZone } from "../error/sim-route53.error.js";
import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "./sim-route53-hosted-zone.js";

/**
 * Find a Hosted Zone by ID, or throw the Route53 NoSuchHostedZone error.
 *
 * Commands that operate on one hosted zone share this lookup so they report a
 * missing zone identically, including the zone ID in the message.
 */
export function findSimRoute53HostedZone(
  hostedZones: Map<SimRoute53HostedZoneId, SimRoute53HostedZone>,
  hostedZoneId: SimRoute53HostedZoneId,
): SimRoute53HostedZone {
  const hostedZone = hostedZones.get(hostedZoneId);

  if (hostedZone === undefined) {
    throw new SimRoute53NoSuchHostedZone(
      `No sim Route53 Hosted Zone with ID ${hostedZoneId}`,
    );
  }

  return hostedZone;
}

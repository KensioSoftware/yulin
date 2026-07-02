import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";

/**
 * Simulated Route53 DNS registry across Account scopes.
 *
 * Route53 SDK-style service instances are Account-scoped, but DNS resolution is
 * global within one simulated AWS environment. This registry lets localhost
 * request routing resolve hostnames from hosted zones created in any simulated
 * Account.
 */
export class SimRoute53Registry {
  private readonly hostedZonesById = new Map<
    SimRoute53HostedZoneId,
    SimRoute53HostedZone
  >();

  /**
   * Register a Hosted Zone for global DNS-style resolution.
   */
  registerHostedZone(
    hostedZoneId: SimRoute53HostedZoneId,
    hostedZone: SimRoute53HostedZone,
  ): void {
    this.hostedZonesById.set(hostedZoneId, hostedZone);
  }

  /**
   * Get all globally resolvable Hosted Zones.
   */
  get hostedZones(): ReadonlyMap<SimRoute53HostedZoneId, SimRoute53HostedZone> {
    return this.hostedZonesById;
  }
}

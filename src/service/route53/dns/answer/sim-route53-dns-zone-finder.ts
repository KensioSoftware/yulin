import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";

/**
 * Find the hosted zone that answers for a DNS name.
 *
 * Route53 picks the most specific zone whose name contains the queried name, so
 * a query for `www.sub.example.test` is answered by `sub.example.test` when both
 * that zone and `example.test` exist. Zones are only entries in a map, so the
 * longest matching zone name wins rather than there being a real DNS tree.
 */
export class SimRoute53DnsZoneFinder {
  private readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>;

  constructor(hostedZones: ReadonlyMap<string, SimRoute53HostedZone>) {
    this.hostedZones = hostedZones;
  }

  /**
   * Find the most specific hosted zone containing a name, if any holds it.
   */
  find(name: string): SimRoute53HostedZone | undefined {
    let bestZone: SimRoute53HostedZone | undefined;
    let bestZoneNameLength = -1;

    for (const hostedZone of this.hostedZones.values()) {
      const zoneName = simRoute53ZoneName(hostedZone);

      if (
        zoneContainsName(zoneName, name) &&
        zoneName.length > bestZoneNameLength
      ) {
        bestZone = hostedZone;
        bestZoneNameLength = zoneName.length;
      }
    }

    return bestZone;
  }
}

/**
 * Hosted-zone names are stored absolute, with a trailing dot, while record and
 * question names are not.
 */
export function simRoute53ZoneName(hostedZone: SimRoute53HostedZone): string {
  return hostedZone.name.replaceAll(/\.+$/gu, "");
}

function zoneContainsName(zoneName: string, name: string): boolean {
  return name === zoneName || name.endsWith(`.${zoneName}`);
}

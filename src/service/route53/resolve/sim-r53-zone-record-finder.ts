import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "../record/sim-route53-record.js";

/**
 * Find records across hosted zones using Route53-style most-specific zone
 * matching.
 */
export class SimRoute53HostedZoneRecordFinder {
  constructor(
    private readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>,
  ) {}

  /**
   * Find the record from the most-specific matching hosted-zone suffix.
   */
  findRecord(
    name: string,
    type: SimRoute53RecordType,
  ): SimRoute53Record | undefined {
    let bestRecord: SimRoute53Record | undefined;
    let bestZoneNameLength = -1;

    for (const hostedZone of this.hostedZones.values()) {
      const zoneName = this.zoneName(hostedZone);

      /* v8 ignore if */
      if (!this.zoneContainsName(zoneName, name)) {
        continue;
      }

      const record = hostedZone.records.get(name, type);
      if (record !== undefined && zoneName.length > bestZoneNameLength) {
        bestRecord = record;
        bestZoneNameLength = zoneName.length;
      }
    }

    return bestRecord;
  }

  /**
   * Find the most-specific hosted zone whose name covers a record name.
   *
   * This answers whether the simulation is authoritative for a name at all,
   * regardless of which records the zone currently holds, so it is the right
   * lookup for creating a record or for deciding that nothing here could ever
   * answer for a name.
   */
  findZone(name: string): SimRoute53HostedZone | undefined {
    let bestHostedZone: SimRoute53HostedZone | undefined;
    let bestZoneNameLength = -1;

    for (const hostedZone of this.hostedZones.values()) {
      const zoneName = this.zoneName(hostedZone);

      if (!this.zoneContainsName(zoneName, name)) {
        continue;
      }

      if (zoneName.length > bestZoneNameLength) {
        bestHostedZone = hostedZone;
        bestZoneNameLength = zoneName.length;
      }
    }

    return bestHostedZone;
  }

  private zoneName(hostedZone: SimRoute53HostedZone): string {
    return hostedZone.name.replaceAll(/\.+$/g, "");
  }

  private zoneContainsName(zoneName: string, name: string): boolean {
    return name === zoneName || name.endsWith(`.${zoneName}`);
  }
}

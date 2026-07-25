import { normaliseSimRoute53Name } from "../../route53/local-name/sim-route53-local-name.js";
import type { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import { SimRoute53HostedZoneRecordFinder } from "../../route53/resolve/sim-r53-zone-record-finder.js";
import type {
  SimAcmDnsRecordChangeListener,
  SimAcmDnsRecords,
} from "./sim-acm-dns-records.js";

const validationRecordTtl = 300;

interface SimRoute53AcmDnsRecordsProperties {
  readonly route53Registry: SimRoute53Registry;
}

/**
 * Sim Route53 as the DNS sim ACM validates Certificates against.
 *
 * All of the DNS name handling lives here rather than in ACM: Route53 stores
 * record names and values normalised, so comparisons have to be normalised the
 * same way for a trailing dot not to look like a mismatch.
 *
 * The registry spans simulated Accounts, which matches real ACM validating
 * against public DNS. A Certificate in one Account can be validated by a
 * Hosted Zone in another.
 */
export class SimRoute53AcmDnsRecords implements SimAcmDnsRecords {
  private readonly route53Registry: SimRoute53Registry;

  constructor(properties: SimRoute53AcmDnsRecordsProperties) {
    this.route53Registry = properties.route53Registry;
  }

  /**
   * Whether any Hosted Zone covers this domain name.
   */
  hasAuthorityFor(domainName: string): boolean {
    return (
      this.recordFinder().findZone(normaliseSimRoute53Name(domainName)) !==
      undefined
    );
  }

  /**
   * Whether a CNAME with this name resolves to this value.
   */
  hasCname(name: string, value: string): boolean {
    const record = this.recordFinder().findRecord(
      normaliseSimRoute53Name(name),
      "CNAME",
    );

    if (record === undefined) {
      return false;
    }

    return record.values.includes(normaliseSimRoute53Name(value));
  }

  /**
   * Create a CNAME in the Hosted Zone covering its name.
   */
  createCname(name: string, value: string): boolean {
    const normalisedName = normaliseSimRoute53Name(name);
    const hostedZone = this.recordFinder().findZone(normalisedName);

    if (hostedZone === undefined) {
      return false;
    }

    hostedZone.records.upsert({
      name: normalisedName,
      type: "CNAME",
      values: [value],
      ttl: validationRecordTtl,
    });

    return true;
  }

  /**
   * Watch every registered Hosted Zone for record changes.
   */
  onRecordChange(listener: SimAcmDnsRecordChangeListener): void {
    this.route53Registry.onRecordChange(listener);
  }

  /**
   * Hosted zones are registered over time, so the finder is built per lookup
   * rather than held, to always see the current set of zones.
   */
  private recordFinder(): SimRoute53HostedZoneRecordFinder {
    return new SimRoute53HostedZoneRecordFinder(
      this.route53Registry.hostedZones,
    );
  }
}

import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { dnsInternetClass, dnsRecordTypeNumber } from "../dns-record-type.js";
import { encodeDnsRdata } from "../rdata/dns-rdata.js";
import type { DnsResourceRecord } from "../wire/dns-resource-record.js";
import { simRoute53ZoneName } from "./sim-route53-dns-zone-finder.js";

const negativeAnswerTtl = 900;

/**
 * Build the SOA record a negative answer carries in its authority section.
 *
 * A resolver reads the SOA's minimum field to learn how long it may cache the
 * absence of a record, so NXDOMAIN and NODATA answers both carry one. When the
 * zone holds its own SOA record that is used; otherwise one is synthesised, so
 * a zone created without an explicit SOA still produces well-formed negative
 * answers rather than a bare header.
 */
export function simRoute53DnsSoaRecord(
  hostedZone: SimRoute53HostedZone,
): DnsResourceRecord {
  const zoneName = simRoute53ZoneName(hostedZone);
  const storedSoa = hostedZone.records.get(zoneName, "SOA");

  return {
    name: zoneName,
    type: dnsRecordTypeNumber("SOA"),
    class: dnsInternetClass,
    ttl: negativeAnswerTtl,
    rdata: encodeDnsRdata("SOA", soaValue(zoneName, storedSoa?.values.at(0))),
  };
}

function soaValue(zoneName: string, storedValue: string | undefined): string {
  if (storedValue !== undefined) {
    return storedValue;
  }

  // Shaped like a Route53 default SOA: primary name server, responsible
  // mailbox, then serial, refresh, retry, expire and minimum.
  return `ns.${zoneName}. hostmaster.${zoneName}. 1 7200 900 1209600 86400`;
}

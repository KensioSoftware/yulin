import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import {
  dnsInternetClass,
  dnsRecordTypeNumber,
  isSimRoute53DnsRecordType,
} from "../dns-record-type.js";
import { encodeDnsRdata } from "../rdata/dns-rdata.js";
import type { DnsResourceRecord } from "../wire/dns-resource-record.js";

/**
 * TTL used for a record stored without one, which is every alias record: Route53
 * answers an alias using the TTL of whatever it points at, and the simulator has
 * no such target to read.
 */
const defaultRecordTtl = 60;

/**
 * Convert a stored record into the resource records that answer for it.
 *
 * One stored record can hold several values — a TXT record with two strings, or
 * a name with several addresses — and each becomes its own resource record,
 * because the wire format has no notion of a multi-valued record.
 */
export function simRoute53DnsAnswerRecords(
  record: SimRoute53Record,
): readonly DnsResourceRecord[] {
  const recordType = record.type;

  /* v8 ignore if -- a query only reaches records of a type it asked for by
     wire number, and only answered types have one */
  if (!isSimRoute53DnsRecordType(recordType)) {
    return [];
  }

  return record.values.map((value) => ({
    name: record.name,
    type: dnsRecordTypeNumber(recordType),
    class: dnsInternetClass,
    ttl: record.ttl ?? defaultRecordTtl,
    rdata: encodeDnsRdata(recordType, value),
  }));
}

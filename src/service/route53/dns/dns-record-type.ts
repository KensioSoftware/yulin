import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimRoute53RecordType } from "../record/sim-route53-record.js";

/**
 * The stored record types simulated DNS answers queries for.
 *
 * Sim Route53 stores more types than this. `MX`, `SRV`, `CAA` and `PTR` are
 * stored, listed and deployed from a template so a zone can model a real one,
 * but a browser reaching a simulated site needs an address or a CNAME, and a
 * mail record is there to be asserted on rather than resolved. Encoding a type
 * means an RDATA encoder for its wire shape, so the codec carries only the ones
 * an answer actually uses.
 */
export type SimRoute53DnsRecordType = Extract<
  SimRoute53RecordType,
  "A" | "AAAA" | "CNAME" | "TXT" | "NS" | "SOA"
>;

/**
 * DNS resource record type numbers, limited to the types simulated DNS answers.
 *
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml
 */
const typeNumbersByRecordType = new Map<SimRoute53DnsRecordType, number>([
  ["A", 1],
  ["NS", 2],
  ["CNAME", 5],
  ["SOA", 6],
  ["TXT", 16],
  ["AAAA", 28],
]);

const recordTypesByTypeNumber = new Map<number, SimRoute53DnsRecordType>(
  typeNumbersByRecordType
    .entries()
    .map(([recordType, typeNumber]) => [typeNumber, recordType]),
);

const dnsRecordTypes: ReadonlySet<string> = new Set(
  typeNumbersByRecordType.keys(),
);

/**
 * The DNS QTYPE for "any record type", which a resolver may send instead of a
 * specific type.
 */
export const dnsAnyQueryType = 255;

/**
 * The DNS IN (internet) class. Sim Route53 models no other class.
 */
export const dnsInternetClass = 1;

/**
 * Check whether a stored record type is one simulated DNS answers queries for.
 */
export function isSimRoute53DnsRecordType(
  recordType: SimRoute53RecordType,
): recordType is SimRoute53DnsRecordType {
  return dnsRecordTypes.has(recordType);
}

/**
 * Get the wire type number for a record type simulated DNS answers.
 */
export function dnsRecordTypeNumber(
  recordType: SimRoute53DnsRecordType,
): number {
  const typeNumber = typeNumbersByRecordType.get(recordType);

  assertDefined(typeNumber, `No DNS type number for record type ${recordType}`);

  return typeNumber;
}

/**
 * Get the record type for a wire type number, if it is one simulated DNS
 * answers queries for.
 *
 * Unknown and unanswered query types resolve to `undefined` so the caller can
 * answer with no records rather than guessing at a type it cannot encode. A
 * stored type the codec has no RDATA encoder for, such as `MX`, arrives here as
 * a number it does not know and is treated the same way.
 */
export function simRoute53RecordTypeFromNumber(
  typeNumber: number,
): SimRoute53DnsRecordType | undefined {
  return recordTypesByTypeNumber.get(typeNumber);
}

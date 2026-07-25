import type { SimRoute53RecordType } from "../record/sim-route53-record.js";

/**
 * DNS resource record type numbers, limited to the types sim Route53 stores.
 *
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml
 */
const typeNumbersByRecordType = new Map<SimRoute53RecordType, number>([
  ["A", 1],
  ["NS", 2],
  ["CNAME", 5],
  ["SOA", 6],
  ["TXT", 16],
  ["AAAA", 28],
]);

const recordTypesByTypeNumber = new Map<number, SimRoute53RecordType>(
  typeNumbersByRecordType
    .entries()
    .map(([recordType, typeNumber]) => [typeNumber, recordType]),
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
 * Get the wire type number for a sim Route53 record type.
 */
export function dnsRecordTypeNumber(recordType: SimRoute53RecordType): number {
  const typeNumber = typeNumbersByRecordType.get(recordType);

  /* v8 ignore if -- the map covers every sim Route53 record type */
  if (typeNumber === undefined) {
    throw new Error(`No DNS type number for record type ${recordType}`);
  }

  return typeNumber;
}

/**
 * Get the sim Route53 record type for a wire type number, if it is one the
 * simulator stores.
 *
 * Unknown and unsupported query types resolve to `undefined` so the caller can
 * answer with no records rather than guessing at a type it cannot encode.
 */
export function simRoute53RecordTypeFromNumber(
  typeNumber: number,
): SimRoute53RecordType | undefined {
  return recordTypesByTypeNumber.get(typeNumber);
}

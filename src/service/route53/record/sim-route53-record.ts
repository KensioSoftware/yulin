/**
 * Every record type a simulated Hosted Zone stores.
 *
 * The list is wider than the types simulated DNS answers queries for. A zone
 * modelling a real one carries mail and certificate records, and those are there
 * for a test to assert the presence and value of rather than for a resolver to
 * act on, so storing them costs nothing beyond this list. See
 * `SimRoute53DnsRecordType` for the narrower set the DNS server encodes.
 */
export const simRoute53RecordTypes = [
  "A",
  "AAAA",
  "CAA",
  "CNAME",
  "MX",
  "NS",
  "PTR",
  "SOA",
  "SRV",
  "TXT",
] as const;

/**
 * A record type a simulated Hosted Zone stores, derived from the list so the
 * two cannot drift apart.
 */
export type SimRoute53RecordType = (typeof simRoute53RecordTypes)[number];

export interface SimRoute53Record {
  readonly name: string;
  readonly type: SimRoute53RecordType;
  readonly values: readonly string[];
  readonly ttl?: number | undefined;
  readonly alias?: boolean | undefined;
}

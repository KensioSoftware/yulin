import { concatenateBytes } from "./dns-bytes.js";
import { encodeDnsName } from "./dns-name.js";

const recordFixedLength = 10;

/**
 * One answer or authority record, ready to be written into a message.
 */
export interface DnsResourceRecord {
  /** Normalised without a trailing dot. */
  readonly name: string;
  readonly type: number;
  readonly class: number;
  readonly ttl: number;
  readonly rdata: Uint8Array;
}

/**
 * Encode a resource record: name, type, class, TTL, then length-prefixed RDATA.
 *
 * The name is written in full rather than as a compression pointer back to the
 * question, which is legal and is what keeps the encoder free of offset
 * bookkeeping.
 */
export function encodeDnsResourceRecord(record: DnsResourceRecord): Uint8Array {
  const name = encodeDnsName(record.name);
  const fixed = new Uint8Array(recordFixedLength);
  const view = new DataView(fixed.buffer);

  view.setUint16(0, record.type);
  view.setUint16(2, record.class);
  view.setUint32(4, record.ttl);
  view.setUint16(8, record.rdata.length);

  return concatenateBytes([name, fixed, record.rdata]);
}

import { concatenateBytes } from "../wire/dns-bytes.js";
import { encodeDnsName } from "../wire/dns-name.js";
import { DnsMessageFormatError } from "../error/dns-message.error.js";

const soaFieldCount = 7;
const soaIntervalCount = 5;
const maxUnsignedInt32 = 4_294_967_295;

/**
 * Encode an SOA record value as RDATA.
 *
 * Route53 stores an SOA as one whitespace-separated string of seven fields:
 * the primary name server, the responsible party mailbox, then the serial,
 * refresh, retry, expire and minimum intervals. On the wire the two names are
 * encoded as names and the five intervals as unsigned 32-bit values.
 */
export function encodeDnsSoaRdata(value: string): Uint8Array {
  const fields = value.split(/\s+/u).filter((field) => field.length > 0);

  if (fields.length !== soaFieldCount) {
    throw new DnsMessageFormatError(
      `Cannot encode SOA value ${value}: expected ${String(soaFieldCount)} fields, found ${String(fields.length)}`,
    );
  }

  const [primaryNameServer = "", responsibleMailbox = ""] = fields;
  const intervals = new Uint8Array(soaIntervalCount * 4);
  const view = new DataView(intervals.buffer);

  for (const [index, field] of fields.slice(2).entries()) {
    view.setUint32(index * 4, parseInterval(value, field));
  }

  return concatenateBytes([
    encodeDnsName(primaryNameServer),
    encodeDnsName(responsibleMailbox),
    intervals,
  ]);
}

function parseInterval(value: string, field: string): number {
  const interval = Number(field);

  if (
    !Number.isSafeInteger(interval) ||
    interval < 0 ||
    interval > maxUnsignedInt32
  ) {
    throw new DnsMessageFormatError(
      `Cannot encode SOA value ${value}: ${field} is not a 32-bit interval`,
    );
  }

  return interval;
}

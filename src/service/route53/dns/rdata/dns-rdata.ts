import type { SimRoute53RecordType } from "../../record/sim-route53-record.js";
import { encodeDnsName } from "../wire/dns-name.js";
import { encodeDnsAaaaRdata, encodeDnsARdata } from "./dns-address-rdata.js";
import { encodeDnsSoaRdata } from "./dns-soa-rdata.js";
import { encodeDnsTxtRdata } from "./dns-text-rdata.js";

/**
 * Encode one stored sim Route53 record value as RDATA for its record type.
 *
 * CNAME and NS RDATA is simply an encoded name, which is why they share the
 * name encoder rather than having wrappers of their own.
 */
export function encodeDnsRdata(
  recordType: SimRoute53RecordType,
  value: string,
): Uint8Array {
  switch (recordType) {
    case "A": {
      return encodeDnsARdata(value);
    }
    case "AAAA": {
      return encodeDnsAaaaRdata(value);
    }
    case "CNAME":
    case "NS": {
      return encodeDnsName(value);
    }
    case "TXT": {
      return encodeDnsTxtRdata(value);
    }
    case "SOA": {
      return encodeDnsSoaRdata(value);
    }
  }
}

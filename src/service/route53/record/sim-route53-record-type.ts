import type { SimRoute53RecordType } from "./sim-route53-record.js";

/**
 * Check whether a value is a sim Route53 record type.
 */
export function isSimRoute53RecordType(
  value: unknown,
): value is SimRoute53RecordType {
  return (
    typeof value === "string" &&
    ["A", "AAAA", "CNAME", "TXT", "NS", "SOA"].includes(value)
  );
}

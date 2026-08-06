import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";
import type { SimRoute53RecordType } from "./sim-route53-record.js";

/**
 * Record types whose values are stored exactly as they were given.
 *
 * A `TXT` value is arbitrary text. The rest hold a structured string — a
 * preference and a host, a priority, weight, port and target, a CAA flag, tag
 * and value — that nothing in the simulator resolves against, so it is kept as
 * written rather than being taken apart or folded to a DNS name.
 */
const verbatimValueTypes: ReadonlySet<SimRoute53RecordType> = new Set([
  "CAA",
  "MX",
  "PTR",
  "SRV",
  "TXT",
]);

/**
 * Normalise one stored record value for its record type.
 *
 * Values that are hostnames or addresses need consistent comparison, so they go
 * through DNS name normalisation. The rest are kept verbatim.
 */
export function normaliseSimRoute53RecordValue(
  type: SimRoute53RecordType,
  value: string,
): string {
  return verbatimValueTypes.has(type) ? value : normaliseSimRoute53Name(value);
}

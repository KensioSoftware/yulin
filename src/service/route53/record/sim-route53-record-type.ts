import {
  simRoute53RecordTypes,
  type SimRoute53RecordType,
} from "./sim-route53-record.js";

const recordTypes: ReadonlySet<string> = new Set(simRoute53RecordTypes);

/**
 * Check whether a value is a sim Route53 record type.
 */
export function isSimRoute53RecordType(
  value: unknown,
): value is SimRoute53RecordType {
  return typeof value === "string" && recordTypes.has(value);
}

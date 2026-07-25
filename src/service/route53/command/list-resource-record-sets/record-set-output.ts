import { simRoute53AbsoluteName } from "../../local-name/sim-route53-local-name.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import type { SimRoute53ResourceRecordSet } from "../change-resource-record-sets/change-resource-record-sets.cmd.js";

/**
 * Convert a stored Route53 record into an AWS-shaped ResourceRecordSet.
 *
 * Stored record names are normalised without a trailing dot, so the trailing
 * dot is added back here to match Route53 output.
 */
export function toSimRoute53ResourceRecordSet(
  record: SimRoute53Record,
): SimRoute53ResourceRecordSet {
  if (record.alias === true) {
    return toAliasResourceRecordSet(record);
  }

  return {
    Name: simRoute53AbsoluteName(record.name),
    Type: record.type,
    TTL: record.ttl,
    ResourceRecords: record.values.map((value) => ({ Value: value })),
  };
}

/**
 * Convert an alias record into a ResourceRecordSet carrying an AliasTarget.
 *
 * Alias records are stored as an ordinary record value plus an alias flag, so
 * the alias target hosted zone ID is not available to return. Route53 would
 * include `AliasTarget.HostedZoneId`; the simulator omits it rather than
 * inventing a value.
 */
function toAliasResourceRecordSet(
  record: SimRoute53Record,
): SimRoute53ResourceRecordSet {
  const aliasTargetName = record.values.at(0);

  /* v8 ignore if -- alias records always store their target as a record value */
  if (aliasTargetName === undefined) {
    throw new Error(
      `Sim Route53 alias record ${record.type} ${record.name} has no alias target value`,
    );
  }

  return {
    Name: simRoute53AbsoluteName(record.name),
    Type: record.type,
    AliasTarget: {
      DNSName: simRoute53AbsoluteName(aliasTargetName),
      EvaluateTargetHealth: false,
    },
  };
}

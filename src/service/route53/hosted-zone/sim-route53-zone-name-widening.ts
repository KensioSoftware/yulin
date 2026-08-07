import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";

/**
 * Widen a zone name so that it also contains a record name.
 *
 * A zone contains a name when the name is the zone apex or sits below it, so
 * widening means dropping labels from the front of the zone name until what is
 * left is a suffix of the record name too. `www.example.com` widened by
 * `example.com` is `example.com`; widened by `mail.example.com` it is unchanged,
 * because `mail.example.com` is not inside `www.example.com` and dropping labels
 * cannot make it so without going up to `example.com`, which is what happens.
 *
 * This exists for the zone a CDK stack looked up rather than created, whose name
 * the simulation has to infer from the records that reference it. See
 * `SimCfnRoute53LookedUpZone`.
 */
export function widenSimRoute53ZoneName(
  zoneName: string,
  recordName: string,
): string {
  const zoneLabels = normaliseSimRoute53Name(zoneName).split(".");
  const recordLabels = normaliseSimRoute53Name(recordName).split(".");

  const sharedLabels: string[] = [];

  // Walk both names from the right, which is where a domain name's containment
  // is decided, and keep the labels they agree on.
  for (
    let offset = 1;
    offset <= Math.min(zoneLabels.length, recordLabels.length);
    offset += 1
  ) {
    const zoneLabel = zoneLabels[zoneLabels.length - offset];

    if (
      zoneLabel === undefined ||
      zoneLabel !== recordLabels[recordLabels.length - offset]
    ) {
      break;
    }

    sharedLabels.unshift(zoneLabel);
  }

  if (sharedLabels.length === 0) {
    throw new Error(
      `Sim Route53 Hosted Zone ${zoneName} shares no domain suffix with record ${recordName}`,
    );
  }

  return sharedLabels.join(".");
}

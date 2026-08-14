import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimRoute53HostedZone } from "../../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Change } from "../change-resource-record-sets.command.js";
import {
  applyChangeResourceRecordSet,
  validateChangeResourceRecordSet,
} from "../change-resource-record-sets.js";

/**
 * Validates and schedules Route53 record changes for a Hosted Zone.
 *
 * Nothing here waits: the changes are validated, the zone goes to PENDING, and
 * the mutation is handed to the background scheduler. Waiting for it is what
 * the zone's own synchronization is for.
 */
export function scheduleChangeResourceRecordSets(
  background: BackgroundScheduler,
  hostedZone: SimRoute53HostedZone,
  changes: readonly SimRoute53Change[],
): void {
  for (const change of changes) {
    validateChangeResourceRecordSet(change);
  }

  hostedZone.beginSynchronization();

  hostedZone.scheduleSynchronization(background, () => {
    for (const change of changes) {
      applyChangeResourceRecordSet(hostedZone, change);
    }

    hostedZone.markSynchronized();

    return Promise.resolve();
  });
}

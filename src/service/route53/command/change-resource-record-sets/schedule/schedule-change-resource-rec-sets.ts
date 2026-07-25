import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimRoute53HostedZone } from "../../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53Change } from "../change-resource-record-sets.command.js";
import {
  applyChangeResourceRecordSet,
  validateChangeResourceRecordSet,
} from "../change-resource-record-sets.js";

/**
 * Validates and schedules Route53 record changes for a Hosted Zone.
 */
export async function scheduleChangeResourceRecordSets(
  background: BackgroundScheduler,
  hostedZone: SimRoute53HostedZone,
  changes: readonly SimRoute53Change[],
): Promise<void> {
  for (const change of changes) {
    validateChangeResourceRecordSet(change);
  }

  await hostedZone.beginSynchronization();

  hostedZone.scheduleSynchronization(background, async () => {
    for (const change of changes) {
      applyChangeResourceRecordSet(hostedZone, change);
    }

    await hostedZone.completeSynchronization();
  });
}

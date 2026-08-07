import type { SimRoute53HostedZoneId } from "../../../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53 } from "../../../sim-route53.js";

interface SimCfnRoute53LookedUpZoneProperties {
  readonly route53: SimRoute53;
}

/**
 * Stands up the Hosted Zone a CloudFormation template names but never creates.
 *
 * `HostedZone.fromLookup` resolves the zone at synth time, so the ID of a real
 * zone in a real account is written into `cdk.context.json` and into every
 * RecordSet in the synthesized template. Nothing in the template creates that
 * zone, because as far as CloudFormation is concerned it is already there. A
 * simulation deploying the same template has no such zone, and every record in
 * it would fail with NoSuchHostedZone, which is a template that cannot be
 * deployed here at all rather than a fault worth reporting.
 *
 * So the zone is registered on demand, under the ID the template names. This
 * diverges from CloudFormation, which would refuse: the ID belongs to an
 * account the simulation is not, and the alternative is that no stack using
 * `fromLookup` can be simulated without being told separately about a zone the
 * template already describes well enough.
 *
 * What the template does not carry is the zone's name, which `fromLookup` keeps
 * in the context file. It is inferred from the records instead: the first
 * record to reference the zone names it, and a record above that name widens
 * it, which converges on the shortest name containing all of them. That is the
 * zone apex for any stack holding a record there, which is the usual shape, and
 * otherwise it is as much as the template says.
 */
export class SimCfnRoute53LookedUpZone {
  private readonly route53: SimRoute53;

  constructor(properties: SimCfnRoute53LookedUpZoneProperties) {
    this.route53 = properties.route53;
  }

  /**
   * Make sure a Hosted Zone with this ID exists and contains a record name.
   */
  ensure(hostedZoneId: SimRoute53HostedZoneId, recordName: string): void {
    const hostedZone = this.route53.hostedZones.get(hostedZoneId);

    if (hostedZone === undefined) {
      this.route53.registerHostedZone({
        id: hostedZoneId,
        name: recordName,
        nameInferred: true,
      });

      return;
    }

    hostedZone.widenInferredName(recordName);
  }
}

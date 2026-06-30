import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRoute53Record } from "../../../record/sim-route53-record.js";
import type { SimRoute53 } from "../../../sim-route53.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimCfnRoute53RecordSetBuilder } from "../build/sim-cfn-r53-record-set-builder.js";
import { SimCfnRoute53RecordSetHostedZoneResolver } from "../resolve/sim-cfn-r53-rec-set-zone-resolver.js";

interface SimCfnRoute53RecordSetApplicatorProps {
  readonly route53: SimRoute53;
}

/**
 * Creates simulated Route53 Record Sets from CloudFormation Resources.
 */
export class SimCfnRoute53RecordSetApplicator {
  private readonly route53: SimRoute53;
  private readonly hostedZoneResolver: SimCfnRoute53RecordSetHostedZoneResolver;

  constructor(props: SimCfnRoute53RecordSetApplicatorProps) {
    this.route53 = props.route53;
    this.hostedZoneResolver = new SimCfnRoute53RecordSetHostedZoneResolver({
      route53: this.route53,
    });
  }

  /**
   * Create a simulated Record Set from an AWS::Route53::RecordSet Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRoute53Record> {
    const hostedZoneId = this.hostedZoneResolver.hostedZoneId(
      resource,
      properties,
    );
    const recordSet = new SimCfnRoute53RecordSetBuilder(
      resource,
      properties,
    ).build();

    assertDefined(recordSet.Name, "Route53 record set name");
    assertDefined(recordSet.Type, "Route53 record set type");

    await this.route53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: recordSet,
            },
          ],
        },
      },
    });

    const hostedZone = this.route53.hostedZones.get(hostedZoneId);
    assertDefined(hostedZone, "Sim Route53 Hosted Zone after update");

    await hostedZone.waitForSynchronizationComplete();

    const record = hostedZone.records.get(recordSet.Name, recordSet.Type);
    assertDefined(record, "Sim Route53 Record after update");

    return record;
  }
}

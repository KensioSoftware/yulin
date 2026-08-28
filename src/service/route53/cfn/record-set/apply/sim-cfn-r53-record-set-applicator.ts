import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "../../../record/sim-route53-record.js";
import type { SimRoute53 } from "../../../sim-route53.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimCfnRoute53RecordSetBuilder } from "../build/sim-cfn-r53-record-set-builder.js";
import { SimCfnRoute53RecordSetHostedZoneResolver } from "../resolve/sim-cfn-r53-rec-set-zone-resolver.js";
import type { SimCfnResourceCallerOptions } from "../../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnRoute53RecordSetApplicatorProperties {
  readonly route53: SimRoute53;
}

/**
 * Creates simulated Route53 Record Sets from CloudFormation Resources.
 */
export class SimCfnRoute53RecordSetApplicator {
  private readonly route53: SimRoute53;
  private readonly hostedZoneResolver: SimCfnRoute53RecordSetHostedZoneResolver;

  constructor(properties: SimCfnRoute53RecordSetApplicatorProperties) {
    this.route53 = properties.route53;
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
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimRoute53Record> {
    // The record set is built first because resolving the Hosted Zone can
    // register one, and a RecordSet that turns out to be unbuildable or of a
    // skipped record type would otherwise leave that zone behind.
    const recordSetBuilder = new SimCfnRoute53RecordSetBuilder(
      resource,
      properties,
    );
    const recordSet = recordSetBuilder.build();

    assertDefined(recordSet.Name, "Route53 record set name");
    assertDefined(recordSet.Type, "Route53 record set type");

    const hostedZoneId = this.hostedZoneResolver.hostedZoneId(
      resource,
      properties,
    );

    await this.route53.changeResourceRecordSets(
      {
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
      },
      options,
    );

    const hostedZone = this.route53.hostedZones.get(hostedZoneId);
    assertDefined(hostedZone, "Sim Route53 Hosted Zone after update");

    await hostedZone.waitForSynchronizationComplete();

    const record = hostedZone.records.get(
      recordSet.Name,
      recordSet.Type as SimRoute53RecordType,
    );
    assertDefined(record, "Sim Route53 Record after update");

    return record;
  }

  /**
   * Remove the Record Set a Resource created.
   *
   * Route53 only takes changes, so this is a ChangeResourceRecordSets carrying
   * a DELETE change built from the same template properties that created it.
   */
  async delete(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const hostedZoneId = this.hostedZoneResolver.hostedZoneId(
      resource,
      properties,
    );
    const recordSet = new SimCfnRoute53RecordSetBuilder(
      resource,
      properties,
    ).build();

    await this.route53.changeResourceRecordSets(
      {
        input: {
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [{ Action: "DELETE", ResourceRecordSet: recordSet }],
          },
        },
      },
      options,
    );

    await this.route53.hostedZones
      .get(hostedZoneId)
      ?.waitForSynchronizationComplete();
  }
}

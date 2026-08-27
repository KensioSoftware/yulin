import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRoute53 } from "../sim-route53.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import type { SimCfnRoute53RecordSetApplicator } from "./record-set/apply/sim-cfn-r53-record-set-applicator.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnRoute53KskCreator } from "./dnssec/sim-cfn-r53-ksk-creator.js";
import type { SimCfnRoute53ZoneSigningCreator } from "./dnssec/sim-cfn-r53-zone-signing-creator.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnRoute53ResourceDeleterProperties {
  readonly route53: SimRoute53;
  readonly recordSetCreator: SimCfnRoute53RecordSetApplicator;
  readonly keySigningKeyCreator: SimCfnRoute53KskCreator;
  readonly zoneSigningCreator: SimCfnRoute53ZoneSigningCreator;
}

/**
 * Deletes the simulated Route53 resources a CloudFormation Stack created.
 *
 * A record set has no delete command of its own. Route53 only takes changes, so
 * removing one is a ChangeResourceRecordSets carrying a DELETE change built
 * from the same template properties that created it.
 *
 * The Hosted Zone goes last, and only works because it does: DeleteHostedZone
 * refuses a zone that still holds records, and the record set Resources naming
 * the zone have already been taken off it by then.
 *
 * DNSSEC comes off the same way. Signing stops before the key-signing keys go,
 * because a key that is still signing cannot be deleted.
 */
export class SimCfnRoute53ResourceDeleter {
  private readonly route53: SimRoute53;
  private readonly recordSetCreator: SimCfnRoute53RecordSetApplicator;
  private readonly keySigningKeyCreator: SimCfnRoute53KskCreator;
  private readonly zoneSigningCreator: SimCfnRoute53ZoneSigningCreator;

  constructor(properties: SimCfnRoute53ResourceDeleterProperties) {
    this.route53 = properties.route53;
    this.recordSetCreator = properties.recordSetCreator;
    this.keySigningKeyCreator = properties.keySigningKeyCreator;
    this.zoneSigningCreator = properties.zoneSigningCreator;
  }

  /**
   * Delete a simulated Route53 resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "HostedZone": {
        await this.deleteHostedZone(resource, options);
        return;
      }
      case "RecordSet": {
        await this.recordSetCreator.delete(resource, properties, options);
        return;
      }
      case "KeySigningKey": {
        await this.keySigningKeyCreator.delete(resource, properties, options);
        return;
      }
      case "DNSSEC": {
        await this.zoneSigningCreator.delete(resource, properties, options);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim Route53 CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteHostedZone(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const hostedZone = resource.simResource as SimRoute53HostedZone | undefined;
    assertDefined(
      hostedZone,
      `sim Route53 Hosted Zone for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.route53.deleteHostedZone(
      { input: { Id: hostedZone.id } },
      options,
    );
  }
}

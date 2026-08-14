import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { normalizeSimRoute53HostedZoneId } from "../../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53 } from "../../sim-route53.js";
import { simCfnRoute53String } from "./sim-cfn-r53-dnssec-properties.js";

const resourceType = "AWS::Route53::DNSSEC";

interface SimCfnRoute53ZoneSigningCreatorProperties {
  readonly route53: SimRoute53;
}

/**
 * Turns DNSSEC signing on for a hosted zone from a CloudFormation Resource.
 *
 * The Resource has no state of its own beyond the zone it names, so the
 * simulated resource behind it is that hosted zone. Its `Ref` is the hosted
 * zone ID, which is what the Resource's physical ID is on real
 * CloudFormation.
 */
export class SimCfnRoute53ZoneSigningCreator {
  private readonly route53: SimRoute53;

  constructor(properties: SimCfnRoute53ZoneSigningCreatorProperties) {
    this.route53 = properties.route53;
  }

  /**
   * Start signing the zone an AWS::Route53::DNSSEC Resource names.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRoute53HostedZone> {
    const hostedZoneId = this.hostedZoneId(resource, properties);

    await this.route53.enableHostedZoneDnssec({
      input: { HostedZoneId: hostedZoneId },
    });

    const hostedZone = this.route53.hostedZones.get(
      normalizeSimRoute53HostedZoneId(hostedZoneId),
    );
    assertDefined(
      hostedZone,
      `sim Route53 Hosted Zone ${hostedZoneId} after enabling DNSSEC`,
    );

    return hostedZone;
  }

  /**
   * Stop signing the zone as the Resource is removed.
   */
  async delete(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    await this.route53.disableHostedZoneDnssec({
      input: { HostedZoneId: this.hostedZoneId(resource, properties) },
    });
  }

  private hostedZoneId(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    return simCfnRoute53String(
      resource,
      properties["HostedZoneId"],
      resourceType,
      "HostedZoneId",
    );
  }
}

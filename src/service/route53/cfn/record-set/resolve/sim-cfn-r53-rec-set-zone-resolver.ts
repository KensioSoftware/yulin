import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  normalizeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../../../command/create-hosted-zone/sim-route53-zone-id.js";
import { normaliseSimRoute53Name } from "../../../local-name/sim-route53-local-name.js";
import type { SimRoute53 } from "../../../sim-route53.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimCfnRoute53LookedUpZone } from "./sim-cfn-r53-looked-up-zone.js";

interface SimCfnRoute53RecordSetHostedZoneResolverProperties {
  readonly route53: SimRoute53;
}

/**
 * Resolves the target Hosted Zone for an AWS::Route53::RecordSet resource.
 */
export class SimCfnRoute53RecordSetHostedZoneResolver {
  private readonly route53: SimRoute53;
  private readonly lookedUpZone: SimCfnRoute53LookedUpZone;

  constructor(properties: SimCfnRoute53RecordSetHostedZoneResolverProperties) {
    this.route53 = properties.route53;
    this.lookedUpZone = new SimCfnRoute53LookedUpZone({
      route53: this.route53,
    });
  }

  /**
   * Resolve the Hosted Zone ID from either HostedZoneId or HostedZoneName.
   */
  hostedZoneId(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimRoute53HostedZoneId {
    const hostedZoneId = properties["HostedZoneId"];

    if (hostedZoneId !== undefined) {
      if (typeof hostedZoneId !== "string") {
        throw new TypeError(
          `Invalid AWS::Route53::RecordSet ${resource.logicalId}: HostedZoneId must be a string`,
        );
      }

      const normalizedHostedZoneId =
        normalizeSimRoute53HostedZoneId(hostedZoneId);

      // A zone named by ID alone is one the CDK app looked up rather than
      // created, so the simulation stands it up rather than refusing the record.
      this.lookedUpZone.ensure(
        normalizedHostedZoneId,
        this.recordName(resource, properties),
      );

      return normalizedHostedZoneId;
    }

    return this.hostedZoneIdFromName(resource, properties);
  }

  private recordName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const name = properties["Name"];

    if (typeof name !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${resource.logicalId}: Name must be a string`,
      );
    }

    return name;
  }

  private hostedZoneIdFromName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimRoute53HostedZoneId {
    const hostedZoneName = properties["HostedZoneName"];

    if (typeof hostedZoneName !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${resource.logicalId}: HostedZoneId or HostedZoneName must be a string`,
      );
    }

    const normalizedHostedZoneName = `${normaliseSimRoute53Name(hostedZoneName)}.`;

    const hostedZone = this.route53.hostedZones
      .values()
      .find((candidate) => candidate.name === normalizedHostedZoneName);

    assertDefined(
      hostedZone,
      `Invalid AWS::Route53::RecordSet ${resource.logicalId}: HostedZoneName ${hostedZoneName} was not found`,
    );

    return hostedZone.id;
  }
}

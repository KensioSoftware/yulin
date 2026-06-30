import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { assertIsSimRoute53HostedZoneId } from "../../command/create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53 } from "../../sim-route53.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface SimCfnRoute53HostedZoneCreatorProps {
  readonly route53: SimRoute53;
}

/**
 * Creates simulated Route53 Hosted Zones from CloudFormation Resources.
 */
export class SimCfnRoute53HostedZoneCreator {
  private readonly route53: SimRoute53;

  constructor(props: SimCfnRoute53HostedZoneCreatorProps) {
    this.route53 = props.route53;
  }

  /**
   * Create a simulated Hosted Zone from an AWS::Route53::HostedZone Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRoute53HostedZone> {
    const name = properties["Name"];

    if (typeof name !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: Name must be a string`,
      );
    }

    const hostedZoneConfig = properties["HostedZoneConfig"];

    if (
      hostedZoneConfig !== undefined &&
      hostedZoneConfig !== null &&
      (typeof hostedZoneConfig !== "object" || Array.isArray(hostedZoneConfig))
    ) {
      throw new Error(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig must be an object`,
      );
    }

    const route53HostedZoneConfig =
      hostedZoneConfig === undefined || hostedZoneConfig === null
        ? undefined
        : {
            Comment: this.hostedZoneConfigComment(resource, hostedZoneConfig),
            PrivateZone: this.hostedZoneConfigPrivateZone(
              resource,
              hostedZoneConfig,
            ),
          };

    const createOutput = await this.route53.createHostedZone({
      input: {
        Name: name,
        CallerReference: resource.logicalId,
        HostedZoneConfig: route53HostedZoneConfig,
      },
    });

    const hostedZoneId = createOutput.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    const hostedZone = this.route53.hostedZones.get(hostedZoneId);
    assertDefined(
      hostedZone,
      `Sim Route53 Hosted Zone ${hostedZoneId} after CloudFormation creation`,
    );

    return hostedZone;
  }

  private hostedZoneConfigComment(
    resource: SimCfnResource,
    hostedZoneConfig: SimCfnTemplateValueRecord,
  ): string | undefined {
    const comment = hostedZoneConfig["Comment"];

    if (comment === undefined) {
      return undefined;
    }

    if (typeof comment !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig.Comment must be a string`,
      );
    }

    return comment;
  }

  private hostedZoneConfigPrivateZone(
    resource: SimCfnResource,
    hostedZoneConfig: SimCfnTemplateValueRecord,
  ): boolean | undefined {
    const privateZone = hostedZoneConfig["PrivateZone"];

    if (privateZone === undefined) {
      return undefined;
    }

    if (typeof privateZone !== "boolean") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig.PrivateZone must be a boolean`,
      );
    }

    return privateZone;
  }
}

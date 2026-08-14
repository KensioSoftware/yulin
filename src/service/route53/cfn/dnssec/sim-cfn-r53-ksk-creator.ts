import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRoute53KeySigningKey } from "../../dnssec/sim-route53-key-signing-key.js";
import type { SimRoute53 } from "../../sim-route53.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { normalizeSimRoute53HostedZoneId } from "../../command/create-hosted-zone/sim-route53-zone-id.js";
import { simCfnRoute53String } from "./sim-cfn-r53-dnssec-properties.js";

const resourceType = "AWS::Route53::KeySigningKey";

interface SimCfnRoute53KskCreatorProperties {
  readonly route53: SimRoute53;
}

/**
 * Creates simulated Route53 key-signing keys from CloudFormation Resources.
 *
 * Creation goes through `CreateKeySigningKey` rather than building the stored
 * object, so a template gets the same KMS key checks and the same DNSSEC field
 * derivation an SDK caller gets.
 */
export class SimCfnRoute53KskCreator {
  private readonly route53: SimRoute53;

  constructor(properties: SimCfnRoute53KskCreatorProperties) {
    this.route53 = properties.route53;
  }

  /**
   * Create a key-signing key from an AWS::Route53::KeySigningKey Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRoute53KeySigningKey> {
    const hostedZoneId = this.string(
      resource,
      properties["HostedZoneId"],
      "HostedZoneId",
    );
    const name = this.string(resource, properties["Name"], "Name");

    await this.route53.createKeySigningKey({
      input: {
        CallerReference: resource.logicalId,
        HostedZoneId: hostedZoneId,
        KeyManagementServiceArn: this.string(
          resource,
          properties["KeyManagementServiceArn"],
          "KeyManagementServiceArn",
        ),
        Name: name,
        Status: this.string(resource, properties["Status"], "Status"),
      },
    });

    const keySigningKey = this.route53.hostedZones
      .get(normalizeSimRoute53HostedZoneId(hostedZoneId))
      ?.dnssec.keys()
      .find((key) => key.name === name);

    assertDefined(
      keySigningKey,
      `sim Route53 key signing key ${name} after CloudFormation creation`,
    );

    return keySigningKey;
  }

  /**
   * Delete a key-signing key an AWS::Route53::KeySigningKey Resource created.
   *
   * A key still signing cannot be deleted, and a template that deployed one
   * active would otherwise be undeployable, so it is deactivated first. Real
   * CloudFormation does the same thing on its way to removing the Resource.
   */
  async delete(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const input = {
      HostedZoneId: this.string(
        resource,
        properties["HostedZoneId"],
        "HostedZoneId",
      ),
      Name: this.string(resource, properties["Name"], "Name"),
    };

    await this.route53.deactivateKeySigningKey({ input });
    await this.route53.deleteKeySigningKey({ input });
  }

  private string(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): string {
    return simCfnRoute53String(resource, value, resourceType, name);
  }
}

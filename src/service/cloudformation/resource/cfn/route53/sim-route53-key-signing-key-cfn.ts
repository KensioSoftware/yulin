import type { SimRoute53KeySigningKey } from "../../../../route53/dnssec/sim-route53-key-signing-key.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRoute53KeySigningKeyCfnProperties {
  readonly keySigningKey: SimRoute53KeySigningKey;
}

/**
 * CloudFormation-facing values for a simulated Route53 key-signing key.
 */
export class SimRoute53KeySigningKeyCfn implements SimCfnResourceValueAdapter {
  private readonly keySigningKey: SimRoute53KeySigningKey;

  constructor(properties: SimRoute53KeySigningKeyCfnProperties) {
    this.keySigningKey = properties.keySigningKey;
  }

  /**
   * AWS::Route53::KeySigningKey Ref returns the hosted zone ID and the key
   * name joined by a pipe, which is what CDK's `keySigningKeyId` reads.
   */
  refValue(): SimCfnTemplateValue {
    return `${this.keySigningKey.hostedZoneId}|${this.keySigningKey.name}`;
  }

  /**
   * AWS::Route53::KeySigningKey has no Fn::GetAtt attributes, so one is
   * refused rather than answered with something invented.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::Route53::KeySigningKey attribute ${attributeName}`,
    );
  }
}

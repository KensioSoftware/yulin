import type { SimKmsAlias } from "../../../../kms/key/sim-kms-alias.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimKmsAliasCfnProperties {
  readonly alias: SimKmsAlias;
}

/**
 * CloudFormation-facing values for a simulated KMS alias.
 */
export class SimKmsAliasCfn implements SimCfnResourceValueAdapter {
  private readonly alias: SimKmsAlias;

  constructor(properties: SimKmsAliasCfnProperties) {
    this.alias = properties.alias;
  }

  /**
   * AWS::KMS::Alias Ref returns the alias name, such as `alias/app-key`, which
   * is directly usable as a KeyId.
   */
  refValue(): SimCfnTemplateValue {
    return this.alias.aliasName;
  }

  /**
   * AWS::KMS::Alias has no Fn::GetAtt attributes on real CloudFormation, so
   * asking for one is refused rather than answered with the alias ARN a
   * template might have been hoping for.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::KMS::Alias attribute ${attributeName}: ` +
        `AWS::KMS::Alias has no Fn::GetAtt attributes`,
    );
  }
}

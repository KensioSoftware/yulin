import type { SimKmsKey } from "../../../../kms/key/sim-kms-key.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimKmsKeyCfnProperties {
  readonly key: SimKmsKey;
}

/**
 * CloudFormation-facing values for a simulated KMS key.
 */
export class SimKmsKeyCfn implements SimCfnResourceValueAdapter {
  private readonly key: SimKmsKey;

  constructor(properties: SimKmsKeyCfnProperties) {
    this.key = properties.key;
  }

  /**
   * AWS::KMS::Key Ref returns the key ID, not the ARN. That is the difference
   * that matters downstream: a `KmsKeyId` taking a Ref gets the bare UUID, and
   * an IAM policy Resource wanting the key has to use Fn::GetAtt Arn.
   */
  refValue(): SimCfnTemplateValue {
    return this.key.keyId;
  }

  /**
   * AWS::KMS::Key attributes supported by the simulator.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.key.arn;
      }
      case "KeyId": {
        return this.key.keyId;
      }
      default: {
        throw new Error(`Unsupported AWS::KMS::Key attribute ${attributeName}`);
      }
    }
  }
}

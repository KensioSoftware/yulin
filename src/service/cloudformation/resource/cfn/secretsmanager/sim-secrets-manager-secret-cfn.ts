import type { SimSecretsManagerSecret } from "../../../../secretsmanager/secret/sim-secrets-manager-secret.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSecretsManagerSecretCfnProperties {
  readonly secret: SimSecretsManagerSecret;
}

/**
 * CloudFormation-facing values for a simulated Secrets Manager secret.
 */
export class SimSecretsManagerSecretCfn implements SimCfnResourceValueAdapter {
  private readonly secret: SimSecretsManagerSecret;

  constructor(properties: SimSecretsManagerSecretCfnProperties) {
    this.secret = properties.secret;
  }

  /**
   * AWS::SecretsManager::Secret Ref returns the full secret ARN, random
   * suffix and all, which is what makes a Ref usable as a SecretId.
   */
  refValue(): SimCfnTemplateValue {
    return this.secret.arn.value;
  }

  /**
   * AWS::SecretsManager::Secret attributes supported by the simulator.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Id": {
        return this.secret.arn.value;
      }
      default: {
        throw new Error(
          `Unsupported AWS::SecretsManager::Secret attribute ${attributeName}`,
        );
      }
    }
  }
}

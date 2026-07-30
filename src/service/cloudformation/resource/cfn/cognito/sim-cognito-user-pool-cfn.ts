import type { SimCognitoUserPool } from "../../../../cognito/user-pool/sim-cognito-user-pool.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCognitoUserPoolCfnProperties {
  readonly pool: SimCognitoUserPool;
}

/**
 * CloudFormation-facing values for a simulated Cognito user pool.
 */
export class SimCognitoUserPoolCfn implements SimCfnResourceValueAdapter {
  private readonly pool: SimCognitoUserPool;

  constructor(properties: SimCognitoUserPoolCfnProperties) {
    this.pool = properties.pool;
  }

  /**
   * AWS::Cognito::UserPool Ref returns the pool id, not the ARN. That is what
   * an app client, a group and an SDK client all name the pool by, so a Ref is
   * usable straight through as a `UserPoolId`.
   */
  refValue(): SimCfnTemplateValue {
    return this.pool.id;
  }

  /**
   * AWS::Cognito::UserPool attributes supported by the simulator.
   *
   * `ProviderName` and `ProviderURL` are the same string with and without the
   * scheme, which is the distinction that matters downstream: a JWT `iss`
   * claim and an OIDC issuer take the URL, while an identity pool's provider
   * name takes the bare one.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.pool.arn.value;
      }
      case "ProviderName": {
        return this.pool.providerName;
      }
      case "ProviderURL": {
        return this.pool.issuerUrl;
      }
      case "UserPoolId": {
        return this.pool.id;
      }
      default: {
        throw new Error(
          `Unsupported AWS::Cognito::UserPool attribute ${attributeName}`,
        );
      }
    }
  }
}

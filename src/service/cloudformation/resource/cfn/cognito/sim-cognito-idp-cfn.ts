import type { SimCognitoUserPoolIdentityProvider } from "../../../../cognito/user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCognitoIdentityProviderCfnProperties {
  readonly provider: SimCognitoUserPoolIdentityProvider;
}

/**
 * CloudFormation-facing values for a simulated Cognito identity provider.
 */
export class SimCognitoIdentityProviderCfn implements SimCfnResourceValueAdapter {
  private readonly provider: SimCognitoUserPoolIdentityProvider;

  constructor(properties: SimCognitoIdentityProviderCfnProperties) {
    this.provider = properties.provider;
  }

  /**
   * AWS::Cognito::UserPoolIdentityProvider Ref returns the provider name,
   * which is what an authorize request names a provider by and what an app
   * client lists in its `SupportedIdentityProviders`. A provider has no id or
   * ARN of its own.
   */
  refValue(): SimCfnTemplateValue {
    return this.provider.name;
  }

  /**
   * AWS::Cognito::UserPoolIdentityProvider publishes no Fn::GetAtt attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::Cognito::UserPoolIdentityProvider attribute ${attributeName}`,
    );
  }
}

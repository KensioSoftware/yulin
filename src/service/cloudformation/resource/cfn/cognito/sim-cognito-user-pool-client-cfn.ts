import type { SimCognitoUserPoolClient } from "../../../../cognito/user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCognitoUserPoolClientCfnProperties {
  readonly client: SimCognitoUserPoolClient;
}

/**
 * CloudFormation-facing values for a simulated Cognito app client.
 */
export class SimCognitoUserPoolClientCfn implements SimCfnResourceValueAdapter {
  private readonly client: SimCognitoUserPoolClient;

  constructor(properties: SimCognitoUserPoolClientCfnProperties) {
    this.client = properties.client;
  }

  /**
   * AWS::Cognito::UserPoolClient Ref returns the client id, which is what an
   * application is configured with and what a sign-in names.
   */
  refValue(): SimCfnTemplateValue {
    return this.client.id;
  }

  /**
   * AWS::Cognito::UserPoolClient publishes one attribute, and it is the client
   * id that `Ref` already returns.
   *
   * The client secret is not among them on real CloudFormation, which is why
   * CDK reaches for a custom resource to get one. `DescribeUserPoolClient`
   * reports it, here as on real Cognito, so a test that needs the secret asks
   * for it that way.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "ClientId") {
      return this.client.id;
    }

    throw new Error(
      `Unsupported AWS::Cognito::UserPoolClient attribute ${attributeName}`,
    );
  }
}

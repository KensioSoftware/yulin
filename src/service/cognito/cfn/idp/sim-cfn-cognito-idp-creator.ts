import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCognitoUserPoolIdentityProvider } from "../../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import { SimCfnCognitoIdpProperties } from "./sim-cfn-cognito-idp-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnCognitoIdpCreatorProperties {
  readonly cognito: SimCognitoIdentityProvider;
}

/**
 * Creates simulated identity providers from
 * AWS::Cognito::UserPoolIdentityProvider Resources.
 *
 * The provider goes through the ordinary CreateIdentityProvider command, so a
 * template gets the same validation an SDK caller would: the provider type is
 * checked, the details that type needs are required, and an attribute mapping
 * onto an attribute no pool holds is refused.
 */
export class SimCfnCognitoIdpCreator {
  private readonly cognito: SimCognitoIdentityProvider;

  constructor(properties: SimCfnCognitoIdpCreatorProperties) {
    this.cognito = properties.cognito;
  }

  /**
   * Create a provider from an AWS::Cognito::UserPoolIdentityProvider Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimCognitoUserPoolIdentityProvider> {
    const providerProperties = new SimCfnCognitoIdpProperties({
      resource,
      properties,
    });
    const providerName = providerProperties.providerName();

    await this.cognito.createIdentityProvider(
      { input: providerProperties.createIdentityProviderInput() },
      options,
    );

    const provider = this.cognito
      .userPool(providerProperties.userPoolId())
      .auth.identityProviders.find(providerName);
    assertDefined(
      provider,
      `sim Cognito identity provider ${providerName} after CloudFormation ` +
        `creation`,
    );

    return provider;
  }
}

import type { SimCognitoUserPoolIdentityProvider } from "../../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import type {
  SimCognitoIdentityProviderType,
  SimCognitoProviderDescription,
} from "./identity-provider.command.js";

/**
 * How a simulated identity provider is reported back to a caller.
 */
export class SimCognitoIdentityProviderView {
  /**
   * A provider as `CreateIdentityProvider`, `DescribeIdentityProvider` and
   * `UpdateIdentityProvider` report it.
   *
   * The provider details are reported as the request set them, secrets
   * included. Real Cognito reports them the same way, which is what makes
   * `DescribeIdentityProvider` enough to rebuild a provider's configuration.
   */
  describe(
    provider: SimCognitoUserPoolIdentityProvider,
  ): SimCognitoIdentityProviderType {
    return {
      UserPoolId: provider.userPoolId,
      ProviderName: provider.name,
      ProviderType: provider.type.value,
      ProviderDetails: provider.details.toOutput(),
      AttributeMapping: provider.attributeMapping.toOutput(),
      IdpIdentifiers: [...provider.idpIdentifiers],
      CreationDate: provider.creationDate,
      LastModifiedDate: provider.lastModifiedDate,
    };
  }

  /**
   * A provider as `ListIdentityProviders` reports it, which carries neither
   * its configuration nor its attribute mapping.
   */
  listEntry(
    provider: SimCognitoUserPoolIdentityProvider,
  ): SimCognitoProviderDescription {
    return {
      ProviderName: provider.name,
      ProviderType: provider.type.value,
      CreationDate: provider.creationDate,
      LastModifiedDate: provider.lastModifiedDate,
    };
  }
}

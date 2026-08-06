import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoUserPoolClientSettingsInput } from "./user-pool-client.command.js";

/**
 * The only identity provider a simulated app client can support.
 *
 * `COGNITO` means the pool's own users, which is what a client supports when
 * a request names no providers at all.
 */
const cognitoIdentityProvider = "COGNITO";

/**
 * Refuses the managed login inputs of an app client.
 *
 * Managed login is a hosted web application and a set of OAuth endpoints,
 * rather than an API this simulation could stand in for, so none of its
 * settings mean anything here.
 */
export class SimCognitoUnsimulatedManagedLogin {
  private readonly unsimulated: SimCognitoUnsimulatedInput;

  constructor(operation: string) {
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
  }

  /**
   * Refuse a request carrying a managed login setting.
   */
  refuseIn(input: SimCognitoUserPoolClientSettingsInput): void {
    this.refuseSupportedIdentityProviders(input.SupportedIdentityProviders);

    this.unsimulated.refuseUnless(
      "AllowedOAuthFlowsUserPoolClient",
      input.AllowedOAuthFlowsUserPoolClient,
      false,
      "the OAuth 2.0 authorization server endpoints",
    );
    this.unsimulated.refuse(
      "AllowedOAuthFlows",
      input.AllowedOAuthFlows,
      "OAuth grants through managed login",
    );
    this.unsimulated.refuse(
      "AllowedOAuthScopes",
      input.AllowedOAuthScopes,
      "OAuth scopes",
    );
    this.unsimulated.refuse(
      "CallbackURLs",
      input.CallbackURLs,
      "managed login redirects",
    );
    this.unsimulated.refuse(
      "LogoutURLs",
      input.LogoutURLs,
      "managed login redirects",
    );
    this.unsimulated.refuse(
      "DefaultRedirectURI",
      input.DefaultRedirectURI,
      "managed login redirects",
    );
  }

  /**
   * Refuse a client federating to an external identity provider.
   *
   * A client supporting only `COGNITO` is asking for the pool's own users,
   * which is what this simulation has, so that one is allowed through.
   */
  private refuseSupportedIdentityProviders(
    providers: readonly string[] = [],
  ): void {
    const federated = providers.filter(
      (provider) => provider !== cognitoIdentityProvider,
    );

    if (federated.length === 0) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `${this.unsimulated.operation} SupportedIdentityProviders ` +
        `'${federated.join(", ")}' is not simulated: federated sign-in ` +
        `happens at the provider rather than in this simulation. Only ` +
        `'${cognitoIdentityProvider}' is supported.`,
    );
  }
}

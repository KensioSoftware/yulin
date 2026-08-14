import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import { simCognitoCodeChallengeMethod } from "../../user-pool/auth/sim-cognito-authorization-code.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolIdentityProvider } from "../../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoAuthorizeInput } from "./hosted-auth.command.js";

/**
 * The response type an authorization code grant asks for.
 */
const codeResponseType = "code";

/**
 * The response type the implicit grant asks for, which is not simulated.
 */
const tokenResponseType = "token";

/**
 * The provider name the pool's own users sign in under.
 */
const localProviderName = "COGNITO";

/**
 * What an authorize request asked for, once it has been checked.
 *
 * Every check here answers by sending the browser back to the application,
 * because by the time they run the request has shown it knows a redirect URI
 * the app client registered. The two checks that come before that are on the
 * endpoint itself, where the answer goes to the browser instead.
 */
export class SimCognitoAuthorizeRequest {
  /**
   * Refuse a response type this endpoint does not answer.
   */
  requireResponseType(responseType: string | undefined): void {
    if (responseType === codeResponseType) {
      return;
    }

    if (responseType === tokenResponseType) {
      throw new SimCognitoOAuthError({
        code: "unauthorized_client",
        description:
          "response_type 'token' is the implicit grant, which is not " +
          "simulated: it hands tokens to the browser, and AWS advises the " +
          "authorization code grant instead",
        redirectable: true,
      });
    }

    throw new SimCognitoOAuthError({
      code: "unsupported_response_type",
      description:
        `response_type '${String(responseType)}' is not a response type: an ` +
        `authorization code grant asks for '${codeResponseType}'`,
      redirectable: true,
    });
  }

  /**
   * Check the PKCE parameters, which arrive together or not at all.
   *
   * Real Cognito supports the `S256` method alone, and refuses a challenge
   * sent without a method to go with it.
   */
  requireChallengeMethod(input: SimCognitoAuthorizeInput): void {
    if (input.code_challenge === undefined) {
      return;
    }

    if (input.code_challenge_method !== simCognitoCodeChallengeMethod) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          `code_challenge_method '${String(input.code_challenge_method)}' is ` +
          `not supported: Cognito supports ` +
          `'${simCognitoCodeChallengeMethod}' alone, and a code_challenge ` +
          `needs one`,
        redirectable: true,
      });
    }
  }

  /**
   * The identity provider this request signs the user in through.
   *
   * A request naming none would reach managed login on real Cognito, which is
   * a page rather than anything an API answers, so it is refused here with a
   * message saying what to do instead.
   */
  requiredProvider(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
  ): SimCognitoUserPoolIdentityProvider {
    const named = input.identity_provider ?? input.idp_identifier;

    if (named === undefined || named === localProviderName) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          "This request would reach managed login, which is a sign-in page " +
          "rather than anything this simulation can answer. Name an " +
          "identity_provider to sign in through, or sign the pool's own " +
          "users in with InitiateAuth or AdminInitiateAuth.",
        redirectable: false,
      });
    }

    const providers = pool.auth.identityProviders;
    const provider = providers.find(named) ?? providers.findByIdentifier(named);

    if (provider === undefined) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description: `User pool ${pool.id} has no identity provider ${named}`,
        redirectable: true,
      });
    }

    this.requireSupportedProvider(client, provider);

    return provider;
  }

  private requireSupportedProvider(
    client: SimCognitoUserPoolClient,
    provider: SimCognitoUserPoolIdentityProvider,
  ): void {
    if (!client.oauth.allowsIdentityProvider(provider.name)) {
      throw new SimCognitoOAuthError({
        code: "unauthorized_client",
        description:
          `App client ${client.id} does not support the ${provider.name} ` +
          `identity provider: add it to the client's ` +
          `SupportedIdentityProviders`,
        redirectable: true,
      });
    }
  }
}

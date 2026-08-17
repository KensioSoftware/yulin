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
 *
 * Real Cognito takes this in an `identity_provider` to mean the local sign-in
 * form rather than any external provider, and a request naming no provider at
 * all reaches the same place once the person has chosen it.
 */
const simCognitoLocalProviderName = "COGNITO";

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
   * Real Cognito supports the `S256` method alone, and requires each of the
   * two parameters where the request carries the other. A method with no
   * challenge is refused rather than answered with a code nothing has to
   * produce a verifier for.
   */
  requireChallengeMethod(input: SimCognitoAuthorizeInput): void {
    if (
      input.code_challenge === undefined &&
      input.code_challenge_method === undefined
    ) {
      return;
    }

    if (input.code_challenge === undefined) {
      throw new SimCognitoOAuthError({
        code: "invalid_request",
        description:
          "code_challenge is required alongside a code_challenge_method: a " +
          "grant made without the challenge would be redeemed without the " +
          "verifier, which is what PKCE is for",
        redirectable: true,
      });
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
   * The identity provider this request signs the user in through, and nothing
   * where it signs one of the pool's own users in.
   *
   * A request naming no provider, or naming `COGNITO`, is a local sign-in: on
   * real Cognito it reaches managed login's own form, and here it carries the
   * username and password that form would have posted.
   */
  signInProvider(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
  ): SimCognitoUserPoolIdentityProvider | undefined {
    const named = input.identity_provider ?? input.idp_identifier;

    if (named === undefined || named === simCognitoLocalProviderName) {
      this.requireSupportedProviderName(client, simCognitoLocalProviderName);

      return undefined;
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

    this.requireSupportedProviderName(client, provider.name);

    return provider;
  }

  /**
   * Refuse a provider the app client does not offer.
   *
   * `COGNITO` is checked the same way, because real Cognito treats it as one
   * of the entries in `SupportedIdentityProviders`: a client without it there
   * signs nobody in at the hosted domain with a password, however many local
   * users the pool holds.
   */
  private requireSupportedProviderName(
    client: SimCognitoUserPoolClient,
    providerName: string,
  ): void {
    if (!client.oauth.allowsIdentityProvider(providerName)) {
      throw new SimCognitoOAuthError({
        code: "unauthorized_client",
        description:
          `App client ${client.id} does not support the ${providerName} ` +
          `identity provider: add it to the client's ` +
          `SupportedIdentityProviders`,
        redirectable: true,
      });
    }
  }
}

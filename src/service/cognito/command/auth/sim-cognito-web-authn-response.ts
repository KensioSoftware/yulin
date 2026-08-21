import type { SimCognitoAuthSession } from "../../user-pool/auth/sim-cognito-auth-session.js";
import { SimCognitoTriggerOccasion } from "../../user-pool/trigger/sim-cognito-trigger-occasion.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoWebAuthnAssertion } from "../../user-pool/user/web-authn/sim-cognito-web-authn-assertion.js";
import type { SimCognitoFirstFactorResponseRequest } from "./sim-cognito-first-factor-response.js";
import type { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoWebAuthnResponseProperties {
  readonly completion: SimCognitoSignInCompletion;
}

/**
 * Answering a `WEB_AUTHN` challenge with a passkey.
 *
 * The credential travels as the JSON a browser serializes a
 * `PublicKeyCredential` to, and it is read against the options the challenge
 * issued. The signature is what settles it, checked against the public key the
 * registration stored.
 *
 * A passkey finishes the sign-in on its own. Real Cognito counts one as having
 * met the pool's MFA requirement, so a user that has registered a second
 * factor is not challenged for it here, where a password sign-in would be.
 */
export class SimCognitoWebAuthnResponse {
  private readonly completion: SimCognitoSignInCompletion;

  constructor(properties: SimCognitoWebAuthnResponseProperties) {
    this.completion = properties.completion;
  }

  /**
   * Present the passkey, and sign the user in.
   */
  async complete(
    request: SimCognitoFirstFactorResponseRequest,
    session: SimCognitoAuthSession,
    user: SimCognitoUser,
  ): Promise<SimCognitoAuthenticationOutput> {
    requireSimCognitoWebAuthnAssertion(
      user.webAuthn.credentials,
      request.parameters.requireDocument("CREDENTIAL"),
      session.requireWebAuthnOptions(),
    );

    request.pool.auth.removeSession(session);

    return await this.completion.complete({
      pool: request.pool,
      client: request.client,
      user,
      occasion: SimCognitoTriggerOccasion.tokenGeneration,
      tokenClientMetadata: request.clientMetadata,
      clientMetadata: request.clientMetadata,
    });
  }
}

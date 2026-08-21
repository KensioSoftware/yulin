import {
  requireSimCognitoConfirmed,
  requireSimCognitoEnabled,
  requireSimCognitoPasswordSet,
  requireSimCognitoSignInUser,
} from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoFirstFactorChallenge } from "./sim-cognito-first-factor-challenge.js";
import type {
  SimCognitoPasswordSignIn,
  SimCognitoAuthRequest,
} from "./sim-cognito-password-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoUserAuthSignInProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly challenge: SimCognitoFirstFactorChallenge;
  readonly passwordSignIn: SimCognitoPasswordSignIn;
  readonly triggers: SimCognitoUserPoolTriggers;
}

/**
 * Choice-based sign-in, which is the `USER_AUTH` flow.
 *
 * The user says who it is and the pool answers with the factors it could sign
 * in with, drawn from the pool's `AllowedFirstAuthFactors` and narrowed to the
 * ones this user has. A request naming a `PREFERRED_CHALLENGE` is answered
 * with that factor's challenge instead, and one carrying a `PASSWORD` outright
 * is signed in there and then, which is what real Cognito does with all three.
 *
 * This is the flow a passkey is presented through. It is also another way in
 * for a password, and `USER_PASSWORD_AUTH` goes on being the direct one.
 */
export class SimCognitoUserAuthSignIn {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly challenge: SimCognitoFirstFactorChallenge;
  private readonly passwordSignIn: SimCognitoPasswordSignIn;
  private readonly triggers: SimCognitoUserPoolTriggers;

  constructor(properties: SimCognitoUserAuthSignInProperties) {
    this.authResolver = properties.authResolver;
    this.challenge = properties.challenge;
    this.passwordSignIn = properties.passwordSignIn;
    this.triggers = properties.triggers;
  }

  /**
   * Offer this user its factors, ask for the one it preferred, or sign it in
   * with the password it already sent.
   *
   * `PreAuthentication` runs once the user is known, as it does for a password
   * sign-in. A request carrying a password reaches it through the password
   * sign-in body, which runs the trigger itself, so this one runs the trigger
   * only where it is answering with a challenge.
   */
  async handle(
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    const { pool, client, parameters, clientMetadata } = request;

    if (parameters.find("PASSWORD") !== undefined) {
      return await this.passwordSignIn.handle(request);
    }

    const username = this.authResolver.username(client, parameters);
    const user = requireSimCognitoSignInUser(pool, client, username);

    await this.triggers.preAuthentication({
      pool,
      client,
      user,
      clientMetadata,
    });

    requireSimCognitoEnabled(user);
    requireSimCognitoConfirmed(user);
    requireSimCognitoPasswordSet(user);

    const preferred = parameters.find("PREFERRED_CHALLENGE");
    const offer = { pool, client, user };

    if (preferred === undefined) {
      return this.challenge.offer(offer);
    }

    return this.challenge.issue(offer, preferred, "PREFERRED_CHALLENGE");
  }
}

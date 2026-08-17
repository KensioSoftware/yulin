import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoFederatedSignIn } from "../../user-pool/idp/sim-cognito-federated-sign-in.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { SimCognitoAuthorizeRequest } from "./sim-cognito-authorize-request.js";
import { SimCognitoHostedPasswordSignIn } from "./sim-cognito-hosted-password-sign-in.js";
import type { SimCognitoAuthorizeInput } from "./hosted-auth.command.js";

interface SimCognitoHostedSignInProperties {
  readonly federatedSignIn: SimCognitoFederatedSignIn;
  readonly clock: SimClock;
}

/**
 * Which user an authorize request signs in.
 *
 * Real Cognito has two answers here. A request naming an identity provider
 * goes to that provider's own sign-in page, and one naming none goes to
 * managed login's form. The choice is made from the same parameter either way,
 * so it is made in one place, and what comes back is the pool user the
 * authorization code is issued for.
 */
export class SimCognitoHostedSignIn {
  private readonly federatedSignIn: SimCognitoFederatedSignIn;
  private readonly clock: SimClock;
  private readonly request = new SimCognitoAuthorizeRequest();
  private readonly passwordSignIn = new SimCognitoHostedPasswordSignIn();

  constructor(properties: SimCognitoHostedSignInProperties) {
    this.federatedSignIn = properties.federatedSignIn;
    this.clock = properties.clock;
  }

  /**
   * The user this request signs in, at a provider or in the pool itself.
   */
  signIn(
    pool: SimCognitoUserPool,
    client: SimCognitoUserPoolClient,
    input: SimCognitoAuthorizeInput,
  ): SimCognitoUser {
    const provider = this.request.signInProvider(pool, client, input);

    if (provider === undefined) {
      return this.passwordSignIn.signIn(pool, client, input);
    }

    return this.federatedSignIn.signIn({
      pool,
      provider,
      now: this.clock.now(),
    });
  }
}

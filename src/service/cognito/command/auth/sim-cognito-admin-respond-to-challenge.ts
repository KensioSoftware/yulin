import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPasswordCheck } from "../../user-pool/sim-cognito-password-check.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { requireSimCognitoNewPasswordChallenge } from "./sim-cognito-auth-flow.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimAdminRespondToAuthChallengeCommand,
  SimAdminRespondToAuthChallengeCommandOutput,
} from "./auth.command.js";

interface SimCognitoAdminRespondToChallengeProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly clock: SimClock;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The AdminRespondToAuthChallenge command.
 *
 * Only `NEW_PASSWORD_REQUIRED` is answered. The new password is checked
 * against the pool's policy, confirms the user, and is what the user signs in
 * with from then on. The session is single use, so a replayed one fails.
 */
export class SimCognitoAdminRespondToChallenge {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly clock: SimClock;
  private readonly result = new SimCognitoAuthenticationResult();
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoAdminRespondToChallengeProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.clock = properties.clock;
  }

  /**
   * Answer a challenge.
   */
  handle(
    command: SimAdminRespondToAuthChallengeCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminRespondToAuthChallengeCommandOutput {
    const { input } = command;
    const { pool, client } = this.authResolver.poolClient(
      "cognito-idp:AdminRespondToAuthChallenge",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInResponse(input);
    requireSimCognitoNewPasswordChallenge(input.ChallengeName);

    const responses = new SimCognitoAuthParameters(
      "ChallengeResponses",
      input.ChallengeResponses,
    );
    const username = this.authResolver.username(client, responses);
    const session = pool.requireAuthSession({
      sessionId: input.Session,
      username,
      clientId: client.id,
      now: this.clock.now(),
    });
    const user = pool.requireUser(requireSimCognitoUsername(username));

    user.setPassword(
      new SimCognitoPasswordCheck(pool.passwordPolicy).require(
        "NEW_PASSWORD",
        responses.find("NEW_PASSWORD"),
      ),
      true,
    );

    pool.removeAuthSession(session);

    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };
  }
}

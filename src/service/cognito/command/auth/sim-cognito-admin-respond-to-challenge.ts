import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { requireSimCognitoNewPasswordChallenge } from "./sim-cognito-auth-challenge.js";
import type { SimCognitoNewPasswordResponse } from "./sim-cognito-new-password-response.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimAdminRespondToAuthChallengeCommand,
  SimAdminRespondToAuthChallengeCommandOutput,
} from "./auth.command.js";

interface SimCognitoAdminRespondToChallengeProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly newPassword: SimCognitoNewPasswordResponse;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The AdminRespondToAuthChallenge command.
 *
 * Only `NEW_PASSWORD_REQUIRED` is answered, and the caller needs the
 * `cognito-idp:AdminRespondToAuthChallenge` permission on the pool.
 */
export class SimCognitoAdminRespondToChallenge {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly newPassword: SimCognitoNewPasswordResponse;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoAdminRespondToChallengeProperties) {
    this.authResolver = properties.authResolver;
    this.newPassword = properties.newPassword;
  }

  /**
   * Answer a challenge.
   */
  async handle(
    command: SimAdminRespondToAuthChallengeCommand,
    options?: SimCognitoCommandOptions,
  ): Promise<SimAdminRespondToAuthChallengeCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.poolClient(
      "cognito-idp:AdminRespondToAuthChallenge",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInAdminResponse(input);
    requireSimCognitoNewPasswordChallenge(input.ChallengeName);

    return await this.newPassword.handle({
      pool,
      client,
      parameters: new SimCognitoAuthParameters(
        "ChallengeResponses",
        input.ChallengeResponses,
      ),
      session: input.Session,
      clientMetadata: input.ClientMetadata,
    });
  }
}

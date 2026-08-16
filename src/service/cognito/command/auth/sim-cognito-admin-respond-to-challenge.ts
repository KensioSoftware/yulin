import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoChallengeResponses } from "./sim-cognito-challenge-responses.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimAdminRespondToAuthChallengeCommand,
  SimAdminRespondToAuthChallengeCommandOutput,
} from "./auth.command.js";

interface SimCognitoAdminRespondToChallengeProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly responses: SimCognitoChallengeResponses;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The AdminRespondToAuthChallenge command.
 *
 * `NEW_PASSWORD_REQUIRED` and the two MFA challenges are answered, and the
 * caller needs the `cognito-idp:AdminRespondToAuthChallenge` permission on the
 * pool.
 */
export class SimCognitoAdminRespondToChallenge {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly responses: SimCognitoChallengeResponses;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoAdminRespondToChallengeProperties) {
    this.authResolver = properties.authResolver;
    this.responses = properties.responses;
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
    return await this.responses.handle(input.ChallengeName, {
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

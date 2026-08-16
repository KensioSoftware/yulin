import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoChallengeResponses } from "./sim-cognito-challenge-responses.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimRespondToAuthChallengeCommand,
  SimRespondToAuthChallengeCommandOutput,
} from "./auth.command.js";

interface SimCognitoRespondToChallengeProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly responses: SimCognitoChallengeResponses;
}

/**
 * The RespondToAuthChallenge command.
 *
 * This completes a challenge an `InitiateAuth` request was answered with, so
 * it names the app client rather than the pool and needs no IAM permission,
 * as real Cognito needs none for it.
 */
export class SimCognitoRespondToChallenge {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly responses: SimCognitoChallengeResponses;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoRespondToChallengeProperties) {
    this.authResolver = properties.authResolver;
    this.responses = properties.responses;
  }

  /**
   * Answer a challenge.
   */
  async handle(
    command: SimRespondToAuthChallengeCommand,
  ): Promise<SimRespondToAuthChallengeCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInResponse(input);
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

import { countedSimCognitoAuth } from "../../metric/sim-cognito-counted-request.js";
import type { SimCognitoPoolMetrics } from "../../metric/sim-cognito-pool-metrics.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoChallengeResponses } from "./sim-cognito-challenge-responses.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimRespondToAuthChallengeCommand,
  SimRespondToAuthChallengeCommandOutput,
} from "./auth.command.js";

interface SimCognitoRespondToChallengeProperties {
  readonly poolMetrics: SimCognitoPoolMetrics;
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
  private readonly poolMetrics: SimCognitoPoolMetrics;
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly responses: SimCognitoChallengeResponses;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoRespondToChallengeProperties) {
    this.poolMetrics = properties.poolMetrics;
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

    // A challenge response is an authentication request of its own, the way
    // real Cognito counts one, so it is counted here rather than where the
    // sign-in it belongs to started.
    return await countedSimCognitoAuth(
      this.poolMetrics,
      "SignInSuccesses",
      { pool, client },
      async () =>
        await this.responses.handle(input.ChallengeName, {
          pool,
          client,
          parameters: new SimCognitoAuthParameters(
            "ChallengeResponses",
            input.ChallengeResponses,
          ),
          session: input.Session,
          clientMetadata: input.ClientMetadata,
        }),
    );
  }
}

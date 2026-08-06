import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { clientAuthFlows } from "./sim-cognito-auth-flows.js";
import type { SimCognitoAuthFlowRunner } from "./sim-cognito-auth-flow-runner.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimInitiateAuthCommand,
  SimInitiateAuthCommandOutput,
} from "./auth.command.js";

interface SimCognitoInitiateAuthProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly flowRunner: SimCognitoAuthFlowRunner;
}

/**
 * The InitiateAuth command.
 *
 * This is what a browser or mobile app calls, so no IAM permission is involved
 * and no caller is read: real Cognito evaluates no IAM policy for it. The app
 * client id is what finds the pool, and the flows it runs are the client-side
 * ones, `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH`.
 */
export class SimCognitoInitiateAuth {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly flowRunner: SimCognitoAuthFlowRunner;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoInitiateAuthProperties) {
    this.authResolver = properties.authResolver;
    this.flowRunner = properties.flowRunner;
  }

  /**
   * Start an authentication.
   */
  async handle(
    command: SimInitiateAuthCommand,
  ): Promise<SimInitiateAuthCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulatedOptions.refuseInInitiate(input);

    const flow = clientAuthFlows.require(input.AuthFlow);

    flow.requireEnabledFor(client);

    return await this.flowRunner.run(flow, {
      pool,
      client,
      parameters: new SimCognitoAuthParameters(
        "AuthParameters",
        input.AuthParameters,
      ),
      clientMetadata: input.ClientMetadata,
    });
  }
}

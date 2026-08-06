import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { adminAuthFlows } from "./sim-cognito-auth-flows.js";
import type { SimCognitoAuthFlowRunner } from "./sim-cognito-auth-flow-runner.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimAdminInitiateAuthCommand,
  SimAdminInitiateAuthCommandOutput,
} from "./auth.command.js";

interface SimCognitoAdminInitiateAuthProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly flowRunner: SimCognitoAuthFlowRunner;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The AdminInitiateAuth command.
 *
 * This is the server-side entry point, so the caller needs the
 * `cognito-idp:AdminInitiateAuth` permission on the pool. It runs
 * `ADMIN_USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH`. A user that gets past
 * its password either receives tokens or, if it still has to replace that
 * password, the `NEW_PASSWORD_REQUIRED` challenge and a session.
 */
export class SimCognitoAdminInitiateAuth {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly flowRunner: SimCognitoAuthFlowRunner;
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoAdminInitiateAuthProperties) {
    this.authResolver = properties.authResolver;
    this.flowRunner = properties.flowRunner;
  }

  /**
   * Start an authentication.
   */
  async handle(
    command: SimAdminInitiateAuthCommand,
    options?: SimCognitoCommandOptions,
  ): Promise<SimAdminInitiateAuthCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.poolClient(
      "cognito-idp:AdminInitiateAuth",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInAdminInitiate(input);

    const flow = adminAuthFlows.require(input.AuthFlow);

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

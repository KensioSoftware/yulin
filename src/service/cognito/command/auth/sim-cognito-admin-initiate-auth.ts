import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSignIn } from "../../user-pool/auth/sim-cognito-sign-in.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import { SimCognitoAuthenticationResult } from "./sim-cognito-authentication-result.js";
import { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import {
  requireSimCognitoAdminUserPasswordFlow,
  requireSimCognitoFlowEnabled,
} from "./sim-cognito-auth-flow.js";
import type { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import { SimCognitoUnsimulatedAuthOptions } from "./sim-cognito-unsimulated-auth-options.js";
import type {
  SimAdminInitiateAuthCommand,
  SimAdminInitiateAuthCommandOutput,
} from "./auth.command.js";

interface SimCognitoAdminInitiateAuthProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly challenge: SimCognitoNewPasswordChallenge;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The AdminInitiateAuth command.
 *
 * Only `ADMIN_USER_PASSWORD_AUTH` runs. A user that gets past its password
 * either receives tokens or, if it still has to replace that password, the
 * `NEW_PASSWORD_REQUIRED` challenge and a session.
 */
export class SimCognitoAdminInitiateAuth {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly tokenIssuer: SimCognitoTokenIssuer;
  private readonly challenge: SimCognitoNewPasswordChallenge;
  private readonly result = new SimCognitoAuthenticationResult();
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedAuthOptions();

  constructor(properties: SimCognitoAdminInitiateAuthProperties) {
    this.authResolver = properties.authResolver;
    this.tokenIssuer = properties.tokenIssuer;
    this.challenge = properties.challenge;
  }

  /**
   * Start an authentication.
   */
  handle(
    command: SimAdminInitiateAuthCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminInitiateAuthCommandOutput {
    const { input } = command;
    const { pool, client } = this.authResolver.poolClient(
      "cognito-idp:AdminInitiateAuth",
      input,
      options,
    );

    this.unsimulatedOptions.refuseInInitiate(input);
    requireSimCognitoAdminUserPasswordFlow(input.AuthFlow);
    requireSimCognitoFlowEnabled(client);

    const parameters = new SimCognitoAuthParameters(
      "AuthParameters",
      input.AuthParameters,
    );
    const username = this.authResolver.username(client, parameters);
    const user = pool.requireUser(requireSimCognitoUsername(username));

    requireSimCognitoSignIn(user, parameters.require("PASSWORD"));

    if (user.status.mustChangePassword) {
      return this.challenge.issue({ pool, clientId: client.id, user });
    }

    return {
      $metadata: {},
      AuthenticationResult: this.result.of(
        this.tokenIssuer.issue({ pool, client, user }),
      ),
    };
  }
}

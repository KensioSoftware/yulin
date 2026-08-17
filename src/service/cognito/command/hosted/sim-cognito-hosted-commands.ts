import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoFederatedSignIn } from "../../user-pool/idp/sim-cognito-federated-sign-in.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoUserFactory } from "../../user-pool/user/sim-cognito-user-factory.js";
import { SimCognitoAuthorizeEndpoint } from "./sim-cognito-authorize-endpoint.js";
import { SimCognitoHostedSignIn } from "./sim-cognito-hosted-sign-in.js";
import { SimCognitoLogoutEndpoint } from "./sim-cognito-logout-endpoint.js";
import { SimCognitoTokenEndpoint } from "./sim-cognito-token-endpoint.js";

interface SimCognitoHostedCommandsProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly userFactory: SimCognitoUserFactory;
  readonly clock: SimClock;
}

/**
 * The endpoints a pool's hosted domain serves.
 *
 * These are not SDK commands, and nothing authorizes an IAM caller for them:
 * they are what a browser and an application's own server reach over HTTP,
 * holding no AWS credentials at all, in the same way `InitiateAuth` holds
 * none. They are built here with the token issuer the API sign-ins use, so a
 * hosted sign-in and an API sign-in hand out the same kind of token.
 */
export class SimCognitoHostedCommands {
  public readonly authorize: SimCognitoAuthorizeEndpoint;
  public readonly token: SimCognitoTokenEndpoint;
  public readonly logout = new SimCognitoLogoutEndpoint();

  constructor(properties: SimCognitoHostedCommandsProperties) {
    const { tokenIssuer, userFactory, clock } = properties;

    this.authorize = new SimCognitoAuthorizeEndpoint({
      signIn: new SimCognitoHostedSignIn({
        federatedSignIn: new SimCognitoFederatedSignIn({ userFactory }),
        clock,
      }),
      clock,
    });
    this.token = new SimCognitoTokenEndpoint({ tokenIssuer, clock });
  }
}

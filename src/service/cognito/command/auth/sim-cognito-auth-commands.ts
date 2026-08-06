import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoAdminInitiateAuth } from "./sim-cognito-admin-initiate-auth.js";
import { SimCognitoAdminRespondToChallenge } from "./sim-cognito-admin-respond-to-challenge.js";
import { SimCognitoAuthFlowRunner } from "./sim-cognito-auth-flow-runner.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { SimCognitoInitiateAuth } from "./sim-cognito-initiate-auth.js";
import { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import { SimCognitoNewPasswordResponse } from "./sim-cognito-new-password-response.js";
import { SimCognitoPasswordSignIn } from "./sim-cognito-password-sign-in.js";
import { SimCognitoRefreshSignIn } from "./sim-cognito-refresh-sign-in.js";
import { SimCognitoRespondToChallenge } from "./sim-cognito-respond-to-challenge.js";
import { SimCognitoSignOutCommands } from "./sim-cognito-sign-out.js";

interface SimCognitoAuthCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly authResolver: SimCognitoAuthResolver;
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
}

/**
 * The authentication command handlers of one simulated Cognito scope.
 *
 * The four sign-in commands share a token issuer and the bodies of the flows
 * they run, and the sign-out commands share the pool store with them, so they
 * are built together here rather than among the pool and directory commands.
 * The resolvers arrive from outside because the sign-up commands resolve an
 * app client the same way these do.
 */
export class SimCognitoAuthCommands {
  public readonly adminInitiateAuth: SimCognitoAdminInitiateAuth;
  public readonly adminRespondToChallenge: SimCognitoAdminRespondToChallenge;
  public readonly initiateAuth: SimCognitoInitiateAuth;
  public readonly respondToChallenge: SimCognitoRespondToChallenge;
  public readonly signOut: SimCognitoSignOutCommands;

  constructor(properties: SimCognitoAuthCommandsProperties) {
    const { resolver, authResolver, pools, clock } = properties;
    const tokenIssuer = new SimCognitoTokenIssuer({ clock });
    const flowRunner = new SimCognitoAuthFlowRunner({
      passwordSignIn: new SimCognitoPasswordSignIn({
        authResolver,
        tokenIssuer,
        challenge: new SimCognitoNewPasswordChallenge({ clock }),
      }),
      refreshSignIn: new SimCognitoRefreshSignIn({ tokenIssuer, clock }),
    });
    const newPassword = new SimCognitoNewPasswordResponse({
      authResolver,
      tokenIssuer,
      clock,
    });

    this.adminInitiateAuth = new SimCognitoAdminInitiateAuth({
      authResolver,
      flowRunner,
    });
    this.adminRespondToChallenge = new SimCognitoAdminRespondToChallenge({
      authResolver,
      newPassword,
    });
    this.initiateAuth = new SimCognitoInitiateAuth({
      authResolver,
      flowRunner,
    });
    this.respondToChallenge = new SimCognitoRespondToChallenge({
      authResolver,
      newPassword,
    });
    this.signOut = new SimCognitoSignOutCommands({ resolver, pools, clock });
  }
}

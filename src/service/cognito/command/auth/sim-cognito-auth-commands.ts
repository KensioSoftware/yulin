import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoPoolMessenger } from "../../user-pool/message/sim-cognito-pool-messenger.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import type { SimCognitoUserPoolTriggers } from "../../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoAdminInitiateAuth } from "./sim-cognito-admin-initiate-auth.js";
import { SimCognitoAdminRespondToChallenge } from "./sim-cognito-admin-respond-to-challenge.js";
import { SimCognitoAuthFlowRunner } from "./sim-cognito-auth-flow-runner.js";
import { SimCognitoGetTokensFromRefreshToken } from "./sim-cognito-get-tokens-from-refresh-token.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import { SimCognitoChallengeResponses } from "./sim-cognito-challenge-responses.js";
import { SimCognitoFirstFactorChallenge } from "./sim-cognito-first-factor-challenge.js";
import { SimCognitoFirstFactorResponse } from "./sim-cognito-first-factor-response.js";
import { SimCognitoPasswordResponse } from "./sim-cognito-password-response.js";
import { SimCognitoWebAuthnResponse } from "./sim-cognito-web-authn-response.js";
import { SimCognitoInitiateAuth } from "./sim-cognito-initiate-auth.js";
import { SimCognitoMfaChallenge } from "./sim-cognito-mfa-challenge.js";
import { SimCognitoMfaResponse } from "./sim-cognito-mfa-response.js";
import { SimCognitoNewPasswordChallenge } from "./sim-cognito-new-password-challenge.js";
import { SimCognitoNewPasswordResponse } from "./sim-cognito-new-password-response.js";
import { SimCognitoPasswordSignIn } from "./sim-cognito-password-sign-in.js";
import { SimCognitoRefreshSignIn } from "./sim-cognito-refresh-sign-in.js";
import { SimCognitoRefreshedTokens } from "./sim-cognito-refreshed-tokens.js";
import { SimCognitoRespondToChallenge } from "./sim-cognito-respond-to-challenge.js";
import { SimCognitoSignInCompletion } from "./sim-cognito-sign-in-completion.js";
import { SimCognitoUserAuthSignIn } from "./sim-cognito-user-auth-sign-in.js";
import { SimCognitoSignOutCommands } from "./sim-cognito-sign-out.js";

interface SimCognitoAuthCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly authResolver: SimCognitoAuthResolver;
  readonly pools: SimCognitoUserPoolStore;
  readonly clock: SimClock;
  readonly triggers: SimCognitoUserPoolTriggers;

  /**
   * What signs the tokens a finished sign-in answers with, shared with the
   * pool's hosted endpoints so both hand out the same thing.
   */
  readonly tokenIssuer: SimCognitoTokenIssuer;

  /**
   * What records the message a pool would have texted an MFA code in, shared
   * with the sign-up and user commands so every message a pool sends is
   * recorded the same way.
   */
  readonly messenger: SimCognitoPoolMessenger;
}

/**
 * The authentication command handlers of one simulated Cognito scope.
 *
 * The four sign-in commands share a token issuer and the bodies of the flows
 * they run, and the sign-out commands share the pool store with them, so they
 * are built together here rather than among the pool and directory commands.
 * The resolvers arrive from outside because the sign-up commands resolve an
 * app client the same way these do, and the triggers because the sign-up and
 * user commands run the pool's `CustomMessage` trigger through the same
 * collaborator.
 */
export class SimCognitoAuthCommands {
  public readonly adminInitiateAuth: SimCognitoAdminInitiateAuth;
  public readonly adminRespondToChallenge: SimCognitoAdminRespondToChallenge;
  public readonly initiateAuth: SimCognitoInitiateAuth;
  public readonly respondToChallenge: SimCognitoRespondToChallenge;
  public readonly getTokensFromRefreshToken: SimCognitoGetTokensFromRefreshToken;
  public readonly signOut: SimCognitoSignOutCommands;

  constructor(properties: SimCognitoAuthCommandsProperties) {
    const {
      resolver,
      authResolver,
      pools,
      clock,
      triggers,
      tokenIssuer,
      messenger,
    } = properties;
    // Every sign-in ends the same way, wherever it finished: with the second
    // factor where the user owes one, and with the tokens and the
    // PostAuthentication trigger where it does not.
    const completion = new SimCognitoSignInCompletion({
      tokenIssuer,
      triggers,
      mfaChallenge: new SimCognitoMfaChallenge({ messenger, clock }),
    });
    // Both refresh operations answer the same way once the token is accepted,
    // and which app client the refresh went through is what decides whether a
    // new refresh token comes back.
    const refreshedTokens = new SimCognitoRefreshedTokens({ tokenIssuer });
    const passwordSignIn = new SimCognitoPasswordSignIn({
      authResolver,
      completion,
      challenge: new SimCognitoNewPasswordChallenge({ clock }),
      triggers,
    });
    // The choice a USER_AUTH sign-in offers is issued in one place and
    // answered in another, and the answer can issue the next challenge, so
    // both halves share the one challenge issuer.
    const firstFactor = new SimCognitoFirstFactorChallenge({ clock });
    const flowRunner = new SimCognitoAuthFlowRunner({
      passwordSignIn,
      refreshSignIn: new SimCognitoRefreshSignIn({ refreshedTokens, clock }),
      userAuthSignIn: new SimCognitoUserAuthSignIn({
        authResolver,
        challenge: firstFactor,
        passwordSignIn,
        triggers,
      }),
    });
    const responses = new SimCognitoChallengeResponses({
      newPassword: new SimCognitoNewPasswordResponse({
        authResolver,
        completion,
        clock,
      }),
      mfa: new SimCognitoMfaResponse({ authResolver, completion, clock }),
      firstFactor: new SimCognitoFirstFactorResponse({
        authResolver,
        challenge: firstFactor,
        password: new SimCognitoPasswordResponse({ completion }),
        webAuthn: new SimCognitoWebAuthnResponse({ completion }),
        clock,
      }),
    });

    this.adminInitiateAuth = new SimCognitoAdminInitiateAuth({
      authResolver,
      flowRunner,
    });
    this.adminRespondToChallenge = new SimCognitoAdminRespondToChallenge({
      authResolver,
      responses,
    });
    this.initiateAuth = new SimCognitoInitiateAuth({
      authResolver,
      flowRunner,
    });
    this.respondToChallenge = new SimCognitoRespondToChallenge({
      authResolver,
      responses,
    });
    this.getTokensFromRefreshToken = new SimCognitoGetTokensFromRefreshToken({
      authResolver,
      refreshedTokens,
      clock,
    });
    this.signOut = new SimCognitoSignOutCommands({ resolver, pools, clock });
  }
}

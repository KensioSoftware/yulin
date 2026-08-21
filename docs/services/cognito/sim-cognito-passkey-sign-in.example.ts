/**
 * Signing in with a registered passkey.
 */

import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import type { SimCognitoIdentityProvider } from "@kensio/yulin/cognito";

declare const cognito: SimCognitoIdentityProvider;
declare const userPoolId: string;
declare const clientId: string;

// The pool answers with the factors this user could sign in with. They are
// what its SignInPolicy allows, narrowed to what the user has.
const offered = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_AUTH",
    AuthParameters: { USERNAME: "alice" },
  }),
);

console.log(offered.ChallengeName); // "SELECT_CHALLENGE"
console.log(offered.AvailableChallenges); // ["PASSWORD", "WEB_AUTHN"]

// Choosing the passkey asks for one, carrying the options a browser would pass
// to navigator.credentials.get().
const challenged = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId: clientId,
    ChallengeName: "SELECT_CHALLENGE",
    Session: offered.Session,
    ChallengeResponses: { USERNAME: "alice", ANSWER: "WEB_AUTHN" },
  }),
);

console.log(challenged.ChallengeName); // "WEB_AUTHN"

// The credential that browser's authenticator would have signed, read off the
// pool because a test has neither.
const presented = cognito
  .userPool(userPoolId)
  .webAuthnAssertion(challenged.Session!);

const signedIn = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId: clientId,
    ChallengeName: "WEB_AUTHN",
    Session: challenged.Session,
    ChallengeResponses: {
      USERNAME: "alice",
      CREDENTIAL: JSON.stringify(presented),
    },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"

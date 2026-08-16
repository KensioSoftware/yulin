/**
 * Signing in with a code texted to the user's phone.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    MfaConfiguration: "OPTIONAL",
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const ClientId = appClient.UserPoolClient!.ClientId!;

// The code has somewhere to go, which is what enabling SMS_MFA needs.
await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    UserAttributes: [{ Name: "phone_number", Value: "+441632960123" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const signIn = new InitiateAuthCommand({
  ClientId,
  AuthFlow: "USER_PASSWORD_AUTH",
  AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
});

// This sign-in is not challenged: the user has registered no factor yet.
const first = await cognito.initiateAuth(signIn);

await cognito.setUserMFAPreference(
  new SetUserMFAPreferenceCommand({
    AccessToken: first.AuthenticationResult!.AccessToken,
    SMSMfaSettings: { Enabled: true, PreferredMfa: true },
  }),
);

const challenged = await cognito.initiateAuth(signIn);

console.log(challenged.ChallengeName); // "SMS_MFA"
console.log(challenged.ChallengeParameters?.["CODE_DELIVERY_DESTINATION"]);
// "+*******0123"

// Nothing is delivered, so the code is read out of the message the pool
// recorded, as a sign-up confirmation code is.
const texted = cognito
  .userPool(userPoolId)
  .sentMessages()
  .find((message) => message.occasion === "Authentication");
const code = /\d{6}/.exec(texted!.body)![0];

const signedIn = await cognito.respondToAuthChallenge(
  new RespondToAuthChallengeCommand({
    ClientId,
    ChallengeName: "SMS_MFA",
    Session: challenged.Session,
    ChallengeResponses: { USERNAME: "alice", SMS_MFA_CODE: code },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"

/**
 * Signing a user up and confirming it with the code the pool issued.
 */

import {
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
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
const clientId = appClient.UserPoolClient!.ClientId!;

const signedUp = await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

console.log(signedUp.UserConfirmed); // false
console.log(signedUp.UserSub); // A UUID, and not "alice"

// Real Cognito sends this to the user and never reports it. Nothing here
// delivers a message, so the pool hands it over instead.
const code = cognito.userPool(userPoolId).confirmationCode("alice");

await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: code,
  }),
);

// The user is CONFIRMED now, and signs in with the password it chose.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

console.log(signedIn.AuthenticationResult?.AccessToken !== undefined); // true

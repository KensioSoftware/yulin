/**
 * Resetting a forgotten password with the code the pool issued.
 */

import {
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ForgotPasswordCommand,
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

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);
await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: cognito.userPool(userPoolId).confirmationCode("alice"),
  }),
);

// The user has forgotten the password it chose at sign-up.
const asked = await cognito.forgotPassword(
  new ForgotPasswordCommand({ ClientId: clientId, Username: "alice" }),
);

console.log(asked.CodeDeliveryDetails?.DeliveryMedium); // "EMAIL"
console.log(asked.CodeDeliveryDetails?.Destination); // "a***@e***.com"

// Real Cognito sends this to the user and never reports it, as with a sign-up
// code. The pool hands it over instead.
const code = cognito.userPool(userPoolId).confirmationCode("alice");

await cognito.confirmForgotPassword(
  new ConfirmForgotPasswordCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: code,
    Password: "Ev3nBetter!",
  }),
);

// The user is CONFIRMED, and the new password is the one that signs it in.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Ev3nBetter!" },
  }),
);

console.log(signedIn.AuthenticationResult?.AccessToken !== undefined); // true

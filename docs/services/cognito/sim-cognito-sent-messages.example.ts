/**
 * Reading the verification message a pool would have sent.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    EmailVerificationSubject: "Welcome to Acme",
    EmailVerificationMessage: "Your Acme code is {####}",
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

const [message] = cognito.userPool(userPoolId).sentMessages();

console.log(message?.recipient); // "alice@example.com"
console.log(message?.medium); // "EMAIL"
console.log(message?.subject); // "Welcome to Acme"
console.log(message?.occasion); // "SignUp"

// The placeholder carries the code the user was issued.
const code = cognito.userPool(userPoolId).confirmationCode("alice")!;

console.log(message?.body === `Your Acme code is ${code}`); // true

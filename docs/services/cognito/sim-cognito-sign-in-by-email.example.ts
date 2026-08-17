/**
 * A simulated pool that signs its users in by email address.
 */

import {
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
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
    UsernameAttributes: ["email"],
  }),
);
const userPoolId = pool.UserPool?.Id;

const client = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = client.UserPoolClient?.ClientId;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice@example.com",
    Password: "Sup3rSecret!",
  }),
);

await cognito.adminConfirmSignUp(
  new AdminConfirmSignUpCommand({
    UserPoolId: userPoolId,
    // Naming the user by the address reaches it, as it does on real Cognito.
    Username: "alice@example.com",
  }),
);

const read = await cognito.adminGetUser(
  new AdminGetUserCommand({
    UserPoolId: userPoolId,
    Username: "alice@example.com",
  }),
);

console.log(read.Username); // A UUID, and not "alice@example.com"
console.log(read.UserAttributes?.find((each) => each.Name === "email")?.Value);
// "alice@example.com"

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: "alice@example.com",
      PASSWORD: "Sup3rSecret!",
    },
  }),
);

console.log(signedIn.AuthenticationResult?.IdToken !== undefined); // true
// The id token's cognito:username claim is the generated username above.

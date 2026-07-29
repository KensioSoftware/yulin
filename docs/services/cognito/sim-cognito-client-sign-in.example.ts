/**
 * Signing in with InitiateAuth, then refreshing the tokens.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

// No pool id, and no caller: the app client id is what finds the pool.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

// Two hours on, the access token has expired and the refresh token has not.
await simAws.clock().advanceBy({ hours: 2 });

const refreshed = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: {
      REFRESH_TOKEN: signedIn.AuthenticationResult!.RefreshToken!,
    },
  }),
);

console.log(refreshed.AuthenticationResult!.IdToken !== undefined); // true
console.log(refreshed.AuthenticationResult!.RefreshToken); // undefined

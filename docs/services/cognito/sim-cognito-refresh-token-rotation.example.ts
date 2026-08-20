/**
 * Renewing a session on an app client that rotates its refresh tokens.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

// A rotating client has no ALLOW_REFRESH_TOKEN_AUTH, which is what
// aws-cdk-lib synthesizes for a refreshTokenRotationGracePeriod.
const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    RefreshTokenRotation: { Feature: "ENABLED", RetryGracePeriodSeconds: 30 },
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

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);
const refreshToken = signedIn.AuthenticationResult!.RefreshToken!;

// An hour on, the access token has expired and the session is renewed.
await simAws.clock().advanceBy({ hours: 1 });

const renewed = await cognito.getTokensFromRefreshToken(
  new GetTokensFromRefreshTokenCommand({
    ClientId: clientId,
    RefreshToken: refreshToken,
  }),
);

// A replacement came back, and the application holds that from now on.
console.log(renewed.AuthenticationResult!.RefreshToken !== refreshToken); // true

// The spent token is still accepted inside the thirty second grace period.
await simAws.clock().advanceBy({ seconds: 10 });

const retried = await cognito.getTokensFromRefreshToken(
  new GetTokensFromRefreshTokenCommand({
    ClientId: clientId,
    RefreshToken: refreshToken,
  }),
);

console.log(retried.AuthenticationResult!.AccessToken !== undefined); // true

// A minute later it has been rotated out for good.
await simAws.clock().advanceBy({ minutes: 1 });

try {
  await cognito.getTokensFromRefreshToken(
    new GetTokensFromRefreshTokenCommand({
      ClientId: clientId,
      RefreshToken: refreshToken,
    }),
  );
} catch (error) {
  console.log((error as Error).message); // "Refresh Token has been revoked."
}

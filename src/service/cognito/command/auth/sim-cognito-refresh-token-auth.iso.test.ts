/* eslint-disable @typescript-eslint/naming-convention -- the authentication
   parameter names are Cognito's own, rather than identifier names. */
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ExplicitAuthFlowsType } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertSetSize,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

const clientFlows: ExplicitAuthFlowsType[] = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
];

interface SimCognitoSignedIn {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly refreshToken: string;
}

async function makeClient(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
  clientName: string,
  authFlows: ExplicitAuthFlowsType[],
): Promise<string> {
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: clientName,
      ExplicitAuthFlows: authFlows,
      RefreshTokenValidity: 0,
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return client.UserPoolClient.ClientId;
}

/**
 * A confirmed user, signed in through the client-side flow, holding a refresh
 * token from an app client that allows refreshing.
 */
async function simCognitoSignedIn(
  authFlows: ExplicitAuthFlowsType[] = clientFlows,
): Promise<SimCognitoSignedIn> {
  const simAws = new SimAws();
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const clientId = await makeClient(cognito, userPoolId, "web", authFlows);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );

  const signedIn = await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: password },
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.RefreshToken);

  return {
    simAws,
    cognito,
    userPoolId,
    clientId,
    refreshToken: signedIn.AuthenticationResult.RefreshToken,
  };
}

function refresh(clientId: string, refreshToken: string): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
}

describe("sim Cognito REFRESH_TOKEN_AUTH", () => {
  it("answers with a new access and id token and no new refresh token", async () => {
    // Given a user that signed in and kept its refresh token.
    const { cognito, clientId, refreshToken } = await simCognitoSignedIn();

    // When it refreshes.
    const refreshed = await cognito.initiateAuth(
      refresh(clientId, refreshToken),
    );

    // Then fresh tokens come back with no refresh token among them, as real
    // Cognito answers with none unless refresh token rotation is on.
    const result = refreshed.AuthenticationResult;

    assertNonNullable(result?.AccessToken);
    assertNonNullable(result.IdToken);
    assertUndefined(result.RefreshToken);
    assertIdentical(result.ExpiresIn, 3600);
    assertIdentical(result.TokenType, "Bearer");
  });

  it("issues tokens that are not the ones the sign-in gave", async () => {
    // Given a user that signed in.
    const { cognito, clientId, refreshToken } = await simCognitoSignedIn();
    const first = await cognito.initiateAuth(refresh(clientId, refreshToken));

    // When it refreshes again with the same token.
    const second = await cognito.initiateAuth(refresh(clientId, refreshToken));

    // Then the refresh token goes on working, and each refresh signs a token
    // of its own.
    const issued = new Set([
      first.AuthenticationResult?.AccessToken,
      second.AuthenticationResult?.AccessToken,
    ]);

    assertNonNullable(second.AuthenticationResult?.AccessToken);
    assertSetSize(issued, 2);
  });

  it("takes REFRESH_TOKEN as the name of the same flow", async () => {
    // Given a user that signed in.
    const { cognito, clientId, refreshToken } = await simCognitoSignedIn();

    // When it refreshes using the other name for the flow.
    const refreshed = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "REFRESH_TOKEN",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    // Then it works, as real Cognito accepts either name.
    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
  });

  it("refreshes through AdminInitiateAuth too", async () => {
    // Given a user signed in through an app client that allows both.
    const { cognito, userPoolId, clientId, refreshToken } =
      await simCognitoSignedIn([
        ...clientFlows,
        "ALLOW_ADMIN_USER_PASSWORD_AUTH",
      ]);

    // When the refresh goes through the admin operation.
    const refreshed = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    // Then it answers the same way, as real Cognito runs the flow on both.
    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
    assertUndefined(refreshed.AuthenticationResult.RefreshToken);
  });

  it("refuses a client the app client is not configured for", async () => {
    // Given an app client without ALLOW_REFRESH_TOKEN_AUTH.
    const { cognito, clientId, refreshToken } = await simCognitoSignedIn([
      "ALLOW_USER_PASSWORD_AUTH",
    ]);

    // When a refresh is tried anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(clientId, refreshToken));
    });

    // Then it is refused before the token is looked at.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "REFRESH_TOKEN_AUTH is not enabled for the client",
    );
  });

  it("refuses a refresh token past the app client's validity", async () => {
    // Given a user that signed in with the default thirty day refresh token.
    const { simAws, cognito, clientId, refreshToken } =
      await simCognitoSignedIn();

    // When a month of simulated time passes.
    await simAws.clock().advanceBy({ days: 31 });

    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(clientId, refreshToken));
    });

    // Then the token is spent, and the user has to sign in again.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Refresh Token has expired");
  });

  it("keeps honouring a refresh token inside the app client's validity", async () => {
    // Given a user that signed in.
    const { simAws, cognito, clientId, refreshToken } =
      await simCognitoSignedIn();

    // When a fortnight of simulated time passes.
    await simAws.clock().advanceBy({ days: 14 });

    // Then the refresh still works, long after the access token expired.
    const refreshed = await cognito.initiateAuth(
      refresh(clientId, refreshToken),
    );

    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
  });

  it("refuses a refresh token issued to another app client", async () => {
    // Given a second app client in the same pool.
    const { cognito, userPoolId, refreshToken } = await simCognitoSignedIn();
    const otherClientId = await makeClient(
      cognito,
      userPoolId,
      "mobile",
      clientFlows,
    );

    // When the first client's token is presented to it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(otherClientId, refreshToken));
    });

    // Then it is refused: a refresh token belongs to the client that got it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("refuses a refresh token no pool issued", async () => {
    // Given a pool with an app client.
    const { cognito, clientId } = await simCognitoSignedIn();

    // When something that is not a refresh token is presented.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(clientId, "not-a-refresh-token"));
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("refuses a refresh for a user that has been disabled", async () => {
    // Given a user that signed in and was then disabled.
    const { cognito, userPoolId, clientId, refreshToken } =
      await simCognitoSignedIn();

    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // When it refreshes.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(clientId, refreshToken));
    });

    // Then it is refused: disabling a user ends its session as well as
    // stopping it signing in again.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "User is disabled");
  });

  it("refuses a refresh for a user that has been deleted", async () => {
    // Given a user that signed in and was then deleted.
    const { cognito, userPoolId, clientId, refreshToken } =
      await simCognitoSignedIn();

    await cognito.adminDeleteUser({
      input: { UserPoolId: userPoolId, Username: "alice" },
    });

    // When it refreshes.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(refresh(clientId, refreshToken));
    });

    // Then the token went with the user.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("refuses a refresh that names no token at all", async () => {
    // Given a pool with an app client.
    const { cognito, clientId } = await simCognitoSignedIn();

    // When the refresh token is left out.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: {},
        }),
      );
    });

    // Then it is refused, naming what was missing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "Missing required parameter REFRESH_TOKEN",
    );
  });
});

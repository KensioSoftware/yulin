import {
  AdminDisableUserCommand,
  GetTokensFromRefreshTokenCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
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
import { simCognitoRefreshableSessionFactory } from "../../user-pool/auth/sim-cognito-refreshable-session.factory.js";

describe("sim Cognito GetTokensFromRefreshToken", () => {
  it("answers with a new access and id token and no new refresh token", async () => {
    // Given a session on an app client that does not rotate.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);

    // When it is renewed.
    const renewed = await cognito.getTokensFromRefreshToken(
      new GetTokensFromRefreshTokenCommand({
        ClientId: session.clientId,
        RefreshToken: session.refreshToken,
      }),
    );

    // Then fresh tokens come back, and the caller keeps the refresh token it
    // already has, as it does from `REFRESH_TOKEN_AUTH`.
    const result = renewed.AuthenticationResult;

    assertNonNullable(result?.AccessToken);
    assertNonNullable(result.IdToken);
    assertUndefined(result.RefreshToken);
    assertIdentical(result.ExpiresIn, 3600);
    assertIdentical(result.TokenType, "Bearer");
  });

  it("takes the client secret of a confidential app client", async () => {
    // Given a session on an app client created with a secret.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { generateSecret: true },
      simAws,
    );

    // When it is renewed with that secret.
    const renewed = await cognito.getTokensFromRefreshToken(
      new GetTokensFromRefreshTokenCommand({
        ClientId: session.clientId,
        ClientSecret: session.clientSecret,
        RefreshToken: session.refreshToken,
      }),
    );

    // Then it works: the secret itself proves the caller, because the request
    // names no user for a `SECRET_HASH` to be computed over.
    assertNonNullable(renewed.AuthenticationResult?.AccessToken);
  });

  it("refuses a client secret that is not the app client's", async () => {
    // Given a session on an app client created with a secret.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { generateSecret: true },
      simAws,
    );

    // When it is renewed with the wrong secret.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          ClientSecret: "a".repeat(52),
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then it is refused before the refresh token is looked at.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid client secret for client");
  });

  it("refuses a request from a confidential client that sent no secret", async () => {
    // Given a session on an app client created with a secret.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { generateSecret: true },
      simAws,
    );

    // When the secret is left out.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then it is refused, so a test notices a secret its application forgot.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid client secret for client");
  });

  it("refuses a refresh token issued to another app client", async () => {
    // Given two sessions, each on its own app client.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);
    const other = await simCognitoRefreshableSessionFactory.make(
      { poolName: "myapp-admins", clientName: "console" },
      simAws,
    );

    // When one client is given the other's token.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: other.clientId,
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then it is refused: a refresh token belongs to the client that got it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("refuses a refresh token that has run out", async () => {
    // Given a session whose refresh token lasts a day.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { refreshTokenValidity: 1 },
      simAws,
    );

    // When two days of simulated time pass.
    await simAws.clock().advanceBy({ days: 2 });

    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then the session is over and the user has to sign in again.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Refresh Token has expired");
  });

  it("refuses a refresh token the user has been signed out of", async () => {
    // Given a session that was then signed out.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: session.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: session.refreshToken },
      }),
    );

    await cognito.globalSignOut(
      new GlobalSignOutCommand({
        AccessToken: signedIn.AuthenticationResult?.AccessToken,
      }),
    );

    // When it is renewed anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then the token went with the session.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid Refresh Token");
  });

  it("refuses a renewal for a user that has been disabled", async () => {
    // Given a session whose user was then disabled.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);

    await cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: session.userPoolId,
        Username: session.username,
      }),
    );

    // When it is renewed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          RefreshToken: session.refreshToken,
        }),
      );
    });

    // Then it is refused: disabling a user ends its session.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "User is disabled");
  });

  it("refuses a request that names no refresh token", async () => {
    // Given an app client.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);

    // When the refresh token is left out.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken({
        input: { ClientId: session.clientId },
      });
    });

    // Then it is refused, naming what was missing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "Missing required parameter RefreshToken",
    );
  });

  it("refuses a request carrying a device key", async () => {
    // Given a session on an app client.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);

    // When it is renewed with the key of a remembered device.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getTokensFromRefreshToken(
        new GetTokensFromRefreshTokenCommand({
          ClientId: session.clientId,
          RefreshToken: session.refreshToken,
          DeviceKey: "eu-west-2_a1b2c3d4-5678-90ab-cdef-EXAMPLE11111",
        }),
      );
    });

    // Then it is refused rather than renewed as though the device meant
    // nothing, because device remembering is not simulated.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "DeviceKey is not simulated");
  });

  it("signs a token of its own each time", async () => {
    // Given a session that has been renewed once.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make({}, simAws);
    const first = await cognito.getTokensFromRefreshToken(
      new GetTokensFromRefreshTokenCommand({
        ClientId: session.clientId,
        RefreshToken: session.refreshToken,
      }),
    );

    // When an hour passes and it is renewed again with the same token.
    await simAws.clock().advanceBy({ hours: 1 });

    const second = await cognito.getTokensFromRefreshToken(
      new GetTokensFromRefreshTokenCommand({
        ClientId: session.clientId,
        RefreshToken: session.refreshToken,
      }),
    );

    // Then the refresh token goes on working, and each renewal signs its own
    // access token.
    const issued = new Set([
      first.AuthenticationResult?.AccessToken,
      second.AuthenticationResult?.AccessToken,
    ]);

    assertNonNullable(second.AuthenticationResult?.AccessToken);
    assertSetSize(issued, 2);
  });
});

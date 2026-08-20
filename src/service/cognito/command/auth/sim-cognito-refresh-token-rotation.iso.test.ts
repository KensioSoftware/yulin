import {
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertSetSize,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import {
  simCognitoRefreshableSessionFactory,
  type SimCognitoRefreshableSessionInput,
} from "../../user-pool/auth/sim-cognito-refreshable-session.factory.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

/**
 * The flows `aws-cdk-lib` gives a rotating app client, which are the ones it
 * asked for without `ALLOW_REFRESH_TOKEN_AUTH`.
 */
const rotatingFlows = ["ALLOW_USER_PASSWORD_AUTH"];

/**
 * The app client settings of a rotating client with a chosen grace period.
 */
function rotation(
  retryGracePeriodSeconds: number,
): Partial<SimCognitoRefreshableSessionInput> {
  return {
    explicitAuthFlows: rotatingFlows,
    refreshTokenRotation: {
      Feature: "ENABLED",
      RetryGracePeriodSeconds: retryGracePeriodSeconds,
    },
  };
}

async function renew(
  cognito: SimCognitoIdentityProvider,
  clientId: string,
  refreshToken: string,
): Promise<string> {
  const renewed = await cognito.getTokensFromRefreshToken(
    new GetTokensFromRefreshTokenCommand({
      ClientId: clientId,
      RefreshToken: refreshToken,
    }),
  );

  assertNonNullable(renewed.AuthenticationResult?.RefreshToken);

  return renewed.AuthenticationResult.RefreshToken;
}

describe("sim Cognito refresh token rotation", () => {
  it("answers with a replacement refresh token", async () => {
    // Given a session on an app client that rotates.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      rotation(30),
      simAws,
    );

    // When it is renewed.
    const replacement = await renew(
      cognito,
      session.clientId,
      session.refreshToken,
    );

    // Then a refresh token comes back, and it is not the one that bought it.
    assertSetSize(new Set([replacement, session.refreshToken]), 2);
  });

  it("honours the replacement on the renewal after it", async () => {
    // Given a session that has been renewed once.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      rotation(30),
      simAws,
    );
    const replacement = await renew(
      cognito,
      session.clientId,
      session.refreshToken,
    );

    // When an hour passes and the replacement is used.
    await simAws.clock().advanceBy({ hours: 1 });

    const second = await renew(cognito, session.clientId, replacement);

    // Then the session goes on, each renewal handing out the next token.
    assertSetSize(new Set([session.refreshToken, replacement, second]), 3);
  });

  it("goes on honouring a spent token inside the grace period", async () => {
    // Given a session renewed by an app client with a thirty second grace
    // period, whose answer the caller never saw.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      rotation(30),
      simAws,
    );

    await renew(cognito, session.clientId, session.refreshToken);

    // When it retries ten seconds later with the token it still holds.
    await simAws.clock().advanceBy({ seconds: 10 });

    const retried = await renew(
      cognito,
      session.clientId,
      session.refreshToken,
    );

    // Then the retry is answered rather than sending the user back to the
    // sign-in page, which is what the grace period is for.
    assertNonNullable(retried);
  });

  it("refuses a spent token once the grace period is up", async () => {
    // Given a session renewed by an app client with a thirty second grace
    // period.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      rotation(30),
      simAws,
    );

    await renew(cognito, session.clientId, session.refreshToken);

    // When a minute passes and the spent token is presented again.
    await simAws.clock().advanceBy({ minutes: 1 });

    const error = await assertThrowsErrorAsync(async () => {
      await renew(cognito, session.clientId, session.refreshToken);
    });

    // Then it is refused: rotating it out is what makes it worth rotating.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Refresh Token has been revoked");
  });

  it("refuses a spent token straight away where there is no grace period", async () => {
    // Given a session renewed by an app client that asked for no grace period.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      rotation(0),
      simAws,
    );

    await renew(cognito, session.clientId, session.refreshToken);

    // When the spent token is presented again in the same moment.
    const error = await assertThrowsErrorAsync(async () => {
      await renew(cognito, session.clientId, session.refreshToken);
    });

    // Then it is already gone, as a successful request invalidates it at once.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Refresh Token has been revoked");
  });

  it("gives a replacement the remaining life of the token it replaced", async () => {
    // Given a session on a client whose refresh tokens last a day, renewed
    // twelve hours in.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { ...rotation(30), refreshTokenValidity: 1 },
      simAws,
    );

    await simAws.clock().advanceBy({ hours: 12 });

    const replacement = await renew(
      cognito,
      session.clientId,
      session.refreshToken,
    );

    // When thirteen more hours pass, taking the whole session past a day.
    await simAws.clock().advanceBy({ hours: 13 });

    const error = await assertThrowsErrorAsync(async () => {
      await renew(cognito, session.clientId, replacement);
    });

    // Then the replacement has run out with the token it replaced, rather
    // than starting a fresh RefreshTokenValidity of its own.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Refresh Token has expired");
  });

  it("keeps honouring a replacement inside the original validity", async () => {
    // Given the same session, renewed twelve hours into its day.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      { ...rotation(30), refreshTokenValidity: 1 },
      simAws,
    );

    await simAws.clock().advanceBy({ hours: 12 });

    const replacement = await renew(
      cognito,
      session.clientId,
      session.refreshToken,
    );

    // When eleven more hours pass, leaving the day not quite up.
    await simAws.clock().advanceBy({ hours: 11 });

    // Then the replacement still renews the session.
    assertNonNullable(await renew(cognito, session.clientId, replacement));
  });

  it("refuses REFRESH_TOKEN_AUTH against a rotating app client", async () => {
    // Given a rotating app client that kept ALLOW_REFRESH_TOKEN_AUTH.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const session = await simCognitoRefreshableSessionFactory.make(
      {
        explicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
        refreshTokenRotation: { Feature: "ENABLED" },
      },
      simAws,
    );

    // When a session on it is renewed the old way.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: session.clientId,
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: { REFRESH_TOKEN: session.refreshToken },
        }),
      );
    });

    // Then it is refused, and told where the operation went. Real Cognito does
    // not run the flow on a rotating client, which is why aws-cdk-lib drops
    // ALLOW_REFRESH_TOKEN_AUTH from one.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "renew the session with GetTokensFromRefreshToken instead",
    );
  });
});

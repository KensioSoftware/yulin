/* eslint-disable @typescript-eslint/naming-convention -- the authentication
   parameter names are Cognito's own, rather than identifier names. */
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeTriggerPool,
  makeTriggerUser,
  triggerFunctionArn,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import {
  signInToTriggerPool,
  triggerTokenClaims,
} from "../../../../../test/cognito/trigger-token-fixture.js";
import type { SimCognitoTriggerPool } from "../../../../../test/cognito/trigger-fixture.js";

const newPassword = "Rep1acementPassw0rd!";

/**
 * Answer the `NEW_PASSWORD_REQUIRED` challenge a user with a temporary
 * password is given, which is where its sign-in finishes.
 */
async function answerChallenge(
  pool: SimCognitoTriggerPool,
  clientMetadata: Readonly<Record<string, string>>,
): Promise<string> {
  const challenged = await pool.cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: pool.userPoolId,
      ClientId: pool.clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
    }),
  );

  assertNonNullable(challenged.Session);

  const signedIn = await pool.cognito.adminRespondToAuthChallenge(
    new AdminRespondToAuthChallengeCommand({
      UserPoolId: pool.userPoolId,
      ClientId: pool.clientId,
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ChallengeResponses: { USERNAME: "alice", NEW_PASSWORD: newPassword },
      Session: challenged.Session,
      ClientMetadata: clientMetadata,
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.IdToken);

  return signedIn.AuthenticationResult.IdToken;
}

describe("sim Cognito PreTokenGeneration trigger occasions", () => {
  it("runs the trigger again on a refresh, with the claim it now returns", async () => {
    // Given a pool whose token trigger names a different tenant the second
    // time it runs.
    const tenants = ["acme", "acme-holdings"];
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: (event: unknown) => ({
        ...(event as object),
        response: {
          claimsOverrideDetails: {
            claimsToAddOrOverride: { tenantId: tenants.shift() ?? "none" },
          },
        },
      }),
    });

    await makeTriggerUser(pool);

    const { idToken, refreshToken } = await signInToTriggerPool(pool);

    assertIdentical(triggerTokenClaims(idToken)["tenantId"], "acme");

    // When the session is renewed with the refresh token.
    const refreshed = await pool.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: pool.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    assertNonNullable(refreshed.AuthenticationResult?.IdToken);

    // Then the reissued token carries what the handler returns now, rather
    // than the claim the first sign-in put on it.
    assertIdentical(
      triggerTokenClaims(refreshed.AuthenticationResult.IdToken)["tenantId"],
      "acme-holdings",
    );
  });

  it("names the refresh as the occasion the trigger fired on", async () => {
    // Given a pool recording every event its token trigger is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    const { refreshToken } = await signInToTriggerPool(pool);

    // When the session is renewed.
    await pool.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: pool.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    // Then the second event names the refresh, so a handler can tell it from
    // the sign-in that came before it.
    assertObjectMatches(events[1], {
      triggerSource: "TokenGeneration_RefreshTokens",
      userName: "alice",
    });
  });

  it("runs the trigger where the new password challenge is answered", async () => {
    // Given a pool with a token trigger, and a user that has to replace its
    // temporary password before it can sign in.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: (event: unknown) => {
        events.push(structuredClone(event));

        return {
          ...(event as object),
          response: {
            claimsOverrideDetails: {
              claimsToAddOrOverride: { tenantId: "acme" },
            },
          },
        };
      },
    });

    await makeTriggerUser(pool, false);

    // When the user answers the challenge, carrying metadata with it.
    const idToken = await answerChallenge(pool, { tenant: "acme" });

    // Then the trigger fired for the occasion real Cognito names it for, and
    // the token it issued carries the claim.
    assertObjectMatches(events[0], {
      triggerSource: "TokenGeneration_NewPasswordChallenge",
      request: { clientMetadata: { tenant: "acme" } },
    });
    assertIdentical(triggerTokenClaims(idToken)["tenantId"], "acme");
  });

  it("refuses the sign-in with the message the handler threw", async () => {
    // Given a token trigger that cannot work out what to put on the token.
    const pool = await makeTriggerPool({
      triggers: { PreTokenGeneration: triggerFunctionArn },
      handler: () => {
        throw new Error("The tenant directory is unreachable");
      },
    });

    await makeTriggerUser(pool);

    // When the user signs in.
    const error = await assertThrowsErrorAsync(async () =>
      signInToTriggerPool(pool),
    );

    // Then the sign-in was refused, carrying the handler's own words, as a
    // failing trigger refuses one on real Cognito.
    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreTokenGeneration failed with error The tenant directory is unreachable.",
    );
  });
});

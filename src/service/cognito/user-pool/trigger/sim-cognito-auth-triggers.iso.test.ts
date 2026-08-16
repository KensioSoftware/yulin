import {
  AdminInitiateAuthCommand,
  AssociateSoftwareTokenCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertNonNullable,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCognitoSoftwareTokenCode } from "../../../../../test/cognito/mfa-fixture.js";
import {
  makeTriggerPool,
  makeTriggerUser,
  triggerFunctionArn,
  triggerPassword,
} from "../../../../../test/cognito/trigger-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";

function signIn(clientId: string): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: triggerPassword },
  });
}

describe("sim Cognito user pool authentication triggers", () => {
  it("invokes the PreAuthentication trigger on InitiateAuth", async () => {
    // Given a pool whose PreAuthentication trigger records what it is given.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PreAuthentication: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    // When a user signs in through the app client.
    const signedIn = await pool.cognito.initiateAuth(signIn(pool.clientId));

    // Then the sign-in answered with tokens.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    // And the handler was given the real event, naming the occasion it fired
    // on, the pool, the app client and the user it fired for.
    assertObjectMatches(events[0], {
      version: "1",
      region: pool.simAws.defaultRegionName,
      userPoolId: pool.userPoolId,
      userName: "alice",
      triggerSource: "PreAuthentication_Authentication",
      callerContext: { clientId: pool.clientId },
      request: {
        userAttributes: { email: "alice@example.com" },
        userNotFound: false,
      },
      response: {},
    });
  });

  it("runs PostAuthentication after the tokens have been issued", async () => {
    // Given a pool with both triggers pointing at the one function.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreAuthentication: triggerFunctionArn,
        PostAuthentication: triggerFunctionArn,
      },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    // When a user signs in.
    const signedIn = await pool.cognito.initiateAuth(signIn(pool.clientId));

    // Then both triggers fired, in the order a sign-in reaches them.
    assertArrayEquals(
      events.map((event) => (event as { triggerSource: string }).triggerSource),
      ["PreAuthentication_Authentication", "PostAuthentication_Authentication"],
    );

    // And the sign-in still answered with the tokens it issued before the
    // second one ran.
    assertNonNullable(signedIn.AuthenticationResult?.IdToken);
  });

  it("runs PostAuthentication only once an MFA challenge is answered", async () => {
    // Given a pool that challenges for a second factor, with both triggers on
    // it, and a user that has registered an authenticator app.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreAuthentication: triggerFunctionArn,
        PostAuthentication: triggerFunctionArn,
      },
      handler: recordingTriggerHandler(events),
      mfaConfiguration: "OPTIONAL",
    });

    await makeTriggerUser(pool);

    const registering = await pool.cognito.initiateAuth(signIn(pool.clientId));
    const accessToken = registering.AuthenticationResult?.AccessToken;

    assertNonNullable(accessToken);

    await pool.cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );
    await pool.cognito.verifySoftwareToken(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: pool.cognito
          .userPool(pool.userPoolId)
          .softwareTokenCode("alice"),
      }),
    );
    await pool.cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // Registering the factor took a sign-in of its own, so what that fired is
    // not what this test is about.
    events.length = 0;

    // When the user signs in again and is challenged for the factor.
    const challenged = await pool.cognito.initiateAuth(signIn(pool.clientId));

    // Then the password has been checked and no token has been issued, so
    // PreAuthentication has run and PostAuthentication has not.
    assertUndefined(challenged.AuthenticationResult);
    assertArrayEquals(
      events.map((event) => (event as { triggerSource: string }).triggerSource),
      ["PreAuthentication_Authentication"],
    );

    // And answering the challenge is what runs the second trigger, because
    // that is where the tokens are issued.
    const signedIn = await pool.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: pool.clientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: "alice",
          SOFTWARE_TOKEN_MFA_CODE: simCognitoSoftwareTokenCode(
            pool.cognito,
            pool.userPoolId,
            "alice",
          ),
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
    assertArrayEquals(
      events.map((event) => (event as { triggerSource: string }).triggerSource),
      ["PreAuthentication_Authentication", "PostAuthentication_Authentication"],
    );
  });

  it("passes ClientMetadata to each trigger under the name it reads", async () => {
    // Given a pool with both triggers on it.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreAuthentication: triggerFunctionArn,
        PostAuthentication: triggerFunctionArn,
      },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    // When the sign-in carries ClientMetadata, which used to be refused.
    await pool.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: pool.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: triggerPassword },
        ClientMetadata: { tenant: "acme" },
      }),
    );

    // Then PreAuthentication reads it as validation data, which is the name
    // real Cognito gives it there.
    assertObjectMatches(events[0], {
      request: { validationData: { tenant: "acme" } },
    });

    // And PostAuthentication reads it as client metadata, which is the name it
    // has there instead.
    assertObjectMatches(events[1], {
      request: { clientMetadata: { tenant: "acme" }, newDeviceUsed: false },
    });
  });

  it("invokes the triggers on AdminInitiateAuth as well", async () => {
    // Given a pool with a PostAuthentication trigger.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: { PostAuthentication: triggerFunctionArn },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    // When the server-side flow signs the same user in.
    await pool.cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: pool.userPoolId,
        ClientId: pool.clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: triggerPassword },
      }),
    );

    // Then the trigger fired for it, because it is the same sign-in as far as
    // real Cognito is concerned.
    assertObjectMatches(events[0], {
      triggerSource: "PostAuthentication_Authentication",
      userName: "alice",
    });
  });

  it("runs no trigger for a refresh, as real Cognito runs none", async () => {
    // Given a signed-in user of a pool with both triggers on it.
    const events: unknown[] = [];
    const pool = await makeTriggerPool({
      triggers: {
        PreAuthentication: triggerFunctionArn,
        PostAuthentication: triggerFunctionArn,
      },
      handler: recordingTriggerHandler(events),
    });

    await makeTriggerUser(pool);

    const signedIn = await pool.cognito.initiateAuth(signIn(pool.clientId));
    const refreshToken = signedIn.AuthenticationResult?.RefreshToken;

    assertNonNullable(refreshToken);
    events.length = 0;

    // When the session is renewed with the refresh token.
    const refreshed = await pool.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: pool.clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    // Then it renewed without firing either trigger: the authentication
    // triggers fire around a sign-in, and a refresh is not one.
    assertNonNullable(refreshed.AuthenticationResult?.AccessToken);
    assertUndefined(events[0]);
  });
});

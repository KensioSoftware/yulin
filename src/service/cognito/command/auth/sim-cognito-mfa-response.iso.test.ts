import {
  AssociateSoftwareTokenCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoSmsMfaCode,
  simCognitoWithSmsFactor,
  simCognitoWithSoftwareToken,
} from "../../../../../test/cognito/mfa-fixture.js";
import type { SimCognitoSignedInSetUp } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  simCognitoPassword,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";
import {
  SimCognitoCodeMismatchException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

/**
 * Sign in with the password and be challenged for the second factor.
 */
async function challenged(
  setUp: SimCognitoSignedInSetUp,
): Promise<SimCognitoAuthenticationOutput> {
  return await setUp.cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: setUp.clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: simCognitoUsername,
        PASSWORD: simCognitoPassword,
      },
    }),
  );
}

/**
 * Answer an `SMS_MFA` challenge with the code given.
 */
async function answerWith(
  setUp: SimCognitoSignedInSetUp,
  session: string | undefined,
  code: string,
): Promise<SimCognitoAuthenticationOutput> {
  return await setUp.cognito.respondToAuthChallenge(
    new RespondToAuthChallengeCommand({
      ClientId: setUp.clientId,
      ChallengeName: "SMS_MFA",
      Session: session,
      ChallengeResponses: { USERNAME: simCognitoUsername, SMS_MFA_CODE: code },
    }),
  );
}

describe("sim Cognito MFA challenge response", () => {
  it("refuses a code that is not the one the pool sent", async () => {
    // Given a user challenged for its texted code.
    const setUp = await simCognitoWithSmsFactor();
    const started = await challenged(setUp);

    // When the wrong code is sent back.
    const error = await assertThrowsErrorAsync(async () => {
      await answerWith(setUp, started.Session, "000000");
    });

    // Then it is refused as a code mismatch, and the challenge is still
    // standing: a user that mistyped a code gets to type it again, as it does
    // on real Cognito.
    assertInstanceOf(error, SimCognitoCodeMismatchException);

    const signedIn = await answerWith(
      setUp,
      started.Session,
      simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a code the wrong authenticator app computed", async () => {
    // Given a user challenged for its app's code.
    const setUp = await simCognitoWithSoftwareToken();
    const started = await challenged(setUp);

    // When a code from some other secret is sent back.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "SOFTWARE_TOKEN_MFA",
          Session: started.Session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            SOFTWARE_TOKEN_MFA_CODE: "000000",
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoCodeMismatchException);
  });

  it("spends the session the code was accepted with", async () => {
    // Given a user that has answered its challenge.
    const setUp = await simCognitoWithSmsFactor();
    const started = await challenged(setUp);
    const code = simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId);

    await answerWith(setUp, started.Session, code);

    // When the same code and session are sent again.
    const error = await assertThrowsErrorAsync(async () => {
      await answerWith(setUp, started.Session, code);
    });

    // Then it signs nobody in a second time: a code is single use, as its
    // session is.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session for the user");
  });

  it("refuses a session that has run out", async () => {
    // Given a user challenged for its texted code.
    const setUp = await simCognitoWithSmsFactor();
    const started = await challenged(setUp);
    const code = simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId);

    // When it answers after the three minutes a session lasts.
    await setUp.simAws.clock().advanceBy({ minutes: 4 });

    const error = await assertThrowsErrorAsync(async () => {
      await answerWith(setUp, started.Session, code);
    });

    // Then the session is refused rather than the code checked.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a session issued for another challenge", async () => {
    // Given a user challenged for its app's code.
    const setUp = await simCognitoWithSoftwareToken();
    const started = await challenged(setUp);

    // When that session is used to answer the other MFA challenge.
    const error = await assertThrowsErrorAsync(async () => {
      await answerWith(setUp, started.Session, "123456");
    });

    // Then it is refused: a session carries the one challenge it was issued
    // for.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a sign-in by a user that prefers neither of its factors", async () => {
    // Given a user with both factors enabled and no preference between them,
    // which is the state SetUserMFAPreference leaves when a request enables
    // both and prefers neither.
    const setUp = await simCognitoWithSmsFactor();

    await setUp.cognito.associateSoftwareToken(
      new AssociateSoftwareTokenCommand({ AccessToken: setUp.accessToken }),
    );
    await setUp.cognito.verifySoftwareToken(
      new VerifySoftwareTokenCommand({
        AccessToken: setUp.accessToken,
        UserCode: setUp.cognito
          .userPool(setUp.userPoolId)
          .softwareTokenCode(simCognitoUsername),
      }),
    );
    await setUp.cognito.setUserMFAPreference(
      new SetUserMFAPreferenceCommand({
        AccessToken: setUp.accessToken,
        SMSMfaSettings: { Enabled: true },
        SoftwareTokenMfaSettings: { Enabled: true },
      }),
    );

    // When it signs in.
    const error = await assertThrowsErrorAsync(async () => {
      await challenged(setUp);
    });

    // Then it is refused where real Cognito would answer with the challenge
    // that asks which factor to use, saying how to get past it.
    assertStringIncludes(error.message, "SELECT_MFA_TYPE");
    assertStringIncludes(error.message, "SetUserMFAPreference");
  });

  it("challenges for a factor after the new password challenge", async () => {
    // Given a user registered for a texted code, whose password an
    // administrator has reset to a temporary one.
    const setUp = await simCognitoWithSmsFactor();

    await setUp.cognito.adminSetUserPassword({
      input: {
        UserPoolId: setUp.userPoolId,
        Username: simCognitoUsername,
        Password: "Temp0rary!",
        Permanent: false,
      },
    });

    // When it signs in and answers the new password challenge.
    const first = await setUp.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: setUp.clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: simCognitoUsername,
          PASSWORD: "Temp0rary!",
        },
      }),
    );

    assertIdentical(first.ChallengeName, "NEW_PASSWORD_REQUIRED");

    const second = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: first.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          NEW_PASSWORD: simCognitoPassword,
        },
      }),
    );

    // Then the second factor is challenged for before any token is issued, as
    // real Cognito challenges one challenge after the other.
    assertIdentical(second.ChallengeName, "SMS_MFA");

    const signedIn = await answerWith(
      setUp,
      second.Session,
      simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });
});

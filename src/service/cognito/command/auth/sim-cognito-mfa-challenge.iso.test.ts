import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoPhoneNumber,
  simCognitoSmsMfaCode,
  simCognitoSoftwareTokenCode,
  simCognitoWithSmsFactor,
  simCognitoWithSoftwareToken,
} from "../../../../../test/cognito/mfa-fixture.js";
import type { SimCognitoSignedInSetUp } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  simCognitoPassword,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

/**
 * Sign in with the password, which is the request a registered factor is
 * answered to with a challenge.
 */
async function signIn(
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

describe("sim Cognito MFA challenge", () => {
  it("challenges a user registered for SMS, and texts it the code", async () => {
    // Given a user of a pool offering MFA, registered for a texted code.
    const setUp = await simCognitoWithSmsFactor();

    // When it signs in with its password.
    const challenged = await signIn(setUp);

    // Then it is answered with the challenge rather than with tokens, saying
    // where the code went without giving the whole number away.
    assertIdentical(challenged.ChallengeName, "SMS_MFA");
    assertTypeString(challenged.Session);
    assertUndefined(challenged.AuthenticationResult);
    assertNonNullable(challenged.ChallengeParameters);
    assertIdentical(
      challenged.ChallengeParameters["CODE_DELIVERY_DELIVERY_MEDIUM"],
      "SMS",
    );
    assertIdentical(
      challenged.ChallengeParameters["CODE_DELIVERY_DESTINATION"],
      "+*******0123",
    );

    // And the pool recorded the message it would have texted, on an occasion
    // of its own, which is where a test reads the code from.
    const messages = setUp.cognito
      .userPool(setUp.userPoolId)
      .sentMessages()
      .filter((message) => message.occasion === "Authentication");

    assertArrayLength(messages, 1);
    assertNonNullable(messages[0]);
    assertIdentical(messages[0].medium, "SMS");
    assertIdentical(messages[0].recipient, simCognitoPhoneNumber);
    assertStringIncludes(messages[0].body, "authentication code is");
  });

  it("signs the user in when the texted code is sent back", async () => {
    // Given a user challenged for its texted code.
    const setUp = await simCognitoWithSmsFactor();
    const challenged = await signIn(setUp);

    // When the code is sent back.
    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "SMS_MFA",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          SMS_MFA_CODE: simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId),
        },
      }),
    );

    // Then the sign-in finishes with the tokens the password alone did not
    // hand out.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
    assertNonNullable(signedIn.AuthenticationResult.IdToken);
    assertNonNullable(signedIn.AuthenticationResult.RefreshToken);
    assertUndefined(signedIn.ChallengeName);
  });

  it("challenges a user registered for an authenticator app", async () => {
    // Given a user of a pool offering MFA, registered for an authenticator
    // app rather than a phone number.
    const setUp = await simCognitoWithSoftwareToken();

    // When it signs in with its password.
    const challenged = await signIn(setUp);

    // Then it is challenged for the app's code, and nothing was sent
    // anywhere: the code is on the user's own device.
    assertIdentical(challenged.ChallengeName, "SOFTWARE_TOKEN_MFA");
    assertTypeString(challenged.Session);
    assertNonNullable(challenged.ChallengeParameters);
    assertUndefined(
      challenged.ChallengeParameters["CODE_DELIVERY_DELIVERY_MEDIUM"],
    );
    assertArrayEmpty(setUp.cognito.userPool(setUp.userPoolId).sentMessages());
  });

  it("signs the user in when the app's code is sent back", async () => {
    // Given a user challenged for its authenticator app's code.
    const setUp = await simCognitoWithSoftwareToken();
    const challenged = await signIn(setUp);

    // When the code that app is showing is sent back. A test computing it from
    // the SecretCode it was given gets the same value, because the secret is a
    // real one.
    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          SOFTWARE_TOKEN_MFA_CODE: simCognitoSoftwareTokenCode(
            setUp.cognito,
            setUp.userPoolId,
          ),
        },
      }),
    );

    // Then the sign-in finishes.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("challenges an administrator's sign-in the same way", async () => {
    // Given a user registered for a texted code.
    const setUp = await simCognitoWithSmsFactor();

    // When an administrator signs it in.
    const challenged = await setUp.cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: setUp.userPoolId,
        ClientId: setUp.clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: simCognitoUsername,
          PASSWORD: simCognitoPassword,
        },
      }),
    );

    // Then that sign-in is challenged too, and answering it hands out tokens.
    assertIdentical(challenged.ChallengeName, "SMS_MFA");

    const signedIn = await setUp.cognito.adminRespondToAuthChallenge(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId: setUp.userPoolId,
        ClientId: setUp.clientId,
        ChallengeName: "SMS_MFA",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          SMS_MFA_CODE: simCognitoSmsMfaCode(setUp.cognito, setUp.userPoolId),
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });
});

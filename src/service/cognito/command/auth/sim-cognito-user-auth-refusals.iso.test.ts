import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoPasskeyAssertion,
  simCognitoRegisterPasskey,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import type { SimCognitoSignedInSetUp } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  simCognitoPassword,
  simCognitoSignedIn,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";

async function userAuth(
  setUp: SimCognitoSignedInSetUp,
  preferred?: string,
): Promise<Awaited<ReturnType<typeof setUp.cognito.initiateAuth>>> {
  return await setUp.cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: setUp.clientId,
      AuthFlow: "USER_AUTH",
      AuthParameters: {
        USERNAME: simCognitoUsername,
        ...(preferred !== undefined && { PREFERRED_CHALLENGE: preferred }),
      },
    }),
  );
}

/**
 * A user challenged for its passkey, and the session that challenge carries.
 */
async function challengedForPasskey(
  setUp: SimCognitoSignedInSetUp,
): Promise<string> {
  await simCognitoRegisterPasskey(setUp);

  const challenged = await userAuth(setUp, "WEB_AUTHN");

  assertNonNullable(challenged.Session);

  return challenged.Session;
}

describe("sim Cognito choice-based sign-in refusals", () => {
  it("refuses the flow on an app client that is not configured for it", async () => {
    // Given an app client that allows the password flow and no other.
    const setUp = await simCognitoSignedIn();

    // When a choice-based sign-in is started through it.
    const error = await assertThrowsErrorAsync(async () => {
      await userAuth(setUp);
    });

    // Then the client is what refuses it, naming the setting that opens it.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "ALLOW_USER_AUTH");
  });

  it("refuses a passkey the user has not registered", async () => {
    // Given a user of a pool that allows passkeys, holding none.
    const setUp = await simCognitoWithPasskeyPool();

    // When it asks to sign in with one.
    const error = await assertThrowsErrorAsync(async () => {
      await userAuth(setUp, "WEB_AUTHN");
    });

    // Then the challenge is not one this sign-in could offer, and the refusal
    // names the ones it could.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not available to this user");
    assertStringIncludes(error.message, "PASSWORD");
  });

  it("refuses a code sent by email, which no pool here delivers", async () => {
    // Given a pool allowing a code sent by email, with a user that has an
    // address to send one to.
    const setUp = await simCognitoSignedIn({
      explicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_AUTH"],
      attributes: [{ Name: "email", Value: "alice@example.com" }],
    });

    await setUp.cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: setUp.userPoolId,
        Policies: {
          SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "EMAIL_OTP"] },
        },
      }),
    );

    // When the user asks for that factor.
    const offered = await userAuth(setUp);
    const error = await assertThrowsErrorAsync(async () => {
      await userAuth(setUp, "EMAIL_OTP");
    });

    // Then the pool offers it, because its policy allows it, and asking for it
    // is refused in words that say what could not be done.
    assertNonNullable(offered.AvailableChallenges);
    assertStringIncludes(offered.AvailableChallenges.join(","), "EMAIL_OTP");
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not simulated");
    assertStringIncludes(error.message, "delivers no message");
  });

  it("refuses a credential another key signed", async () => {
    // Given a user challenged for its passkey, and a second user holding one
    // of its own.
    const setUp = await simCognitoWithPasskeyPool();
    const session = await challengedForPasskey(setUp);
    const other = await simCognitoWithPasskeyPool();
    const otherSession = await challengedForPasskey(other);

    // When the first user answers with the second user's credential.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "WEB_AUTHN",
          Session: session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            CREDENTIAL: simCognitoPasskeyAssertion(other, otherSession),
          },
        }),
      );
    });

    // Then it answers a challenge this pool did not issue, which is the first
    // thing the credential is read for.
    assertStringIncludes(error.message, "challenge this user pool did not");
  });

  it("refuses a credential that is not JSON", async () => {
    // Given a user challenged for its passkey.
    const setUp = await simCognitoWithPasskeyPool();
    const session = await challengedForPasskey(setUp);

    // When it answers with something else.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "WEB_AUTHN",
          Session: session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            CREDENTIAL: "a-passkey-honest",
          },
        }),
      );
    });

    // Then the response is refused for what it is.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "must be JSON");
  });

  it("refuses a passkey answered with the session of another challenge", async () => {
    // Given a user offered its factors, which is a session for
    // SELECT_CHALLENGE.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);

    const offered = await userAuth(setUp);

    assertNonNullable(offered.Session);

    // When that session is used to answer a passkey challenge.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "WEB_AUTHN",
          Session: offered.Session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            CREDENTIAL: "{}",
          },
        }),
      );
    });

    // Then the session carries one challenge, and this is not it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Invalid session for the user");
  });

  it("refuses a credential naming a passkey the user does not have", async () => {
    // Given a user challenged for its passkey, and a credential that names
    // another one.
    const setUp = await simCognitoWithPasskeyPool();
    const session = await challengedForPasskey(setUp);
    const presented = JSON.parse(
      simCognitoPasskeyAssertion(setUp, session),
    ) as Record<string, unknown>;

    presented["id"] = "not-a-credential-of-this-user";

    // When the sign-in answers with it.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "WEB_AUTHN",
          Session: session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            CREDENTIAL: JSON.stringify(presented),
          },
        }),
      );
    });

    // Then the pool holds no such passkey for this user.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "has not registered");
  });

  it("refuses a credential whose signature was replaced", async () => {
    // Given a user challenged for its passkey, and a credential signed with
    // something else.
    const setUp = await simCognitoWithPasskeyPool();
    const session = await challengedForPasskey(setUp);
    const presented = JSON.parse(
      simCognitoPasskeyAssertion(setUp, session),
    ) as { response: Record<string, unknown> };

    presented.response["signature"] =
      Buffer.from("not a signature").toString("base64url");

    // When the sign-in answers with it.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "WEB_AUTHN",
          Session: session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            CREDENTIAL: JSON.stringify(presented),
          },
        }),
      );
    });

    // Then the signature is what settles it, and this one is not the passkey's.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "not signed by this passkey");
  });

  it("leaves the challenge standing after a wrong password", async () => {
    // Given a user asked for its password.
    const setUp = await simCognitoWithPasskeyPool();
    const challenged = await userAuth(setUp, "PASSWORD");

    assertNonNullable(challenged.Session);

    const respond = async (
      password: string,
    ): Promise<Awaited<ReturnType<typeof setUp.cognito.initiateAuth>>> =>
      await setUp.cognito.respondToAuthChallenge(
        new RespondToAuthChallengeCommand({
          ClientId: setUp.clientId,
          ChallengeName: "PASSWORD",
          Session: challenged.Session,
          ChallengeResponses: {
            USERNAME: simCognitoUsername,
            PASSWORD: password,
          },
        }),
      );

    // When it answers wrongly and then rightly with the same session.
    const error = await assertThrowsErrorAsync(async () => {
      await respond("wrong-password");
    });
    const signedIn = await respond(simCognitoPassword);

    // Then the wrong one is refused and the session survives it, as it does
    // for a wrong MFA code.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a passkey read for a session the pool does not hold", async () => {
    // Given a pool that allows passkeys.
    const setUp = await simCognitoWithPasskeyPool();
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When a test reads the credential for a session that is not one.
    const error = assertThrowsError(() => {
      pool.webAuthnAssertion("not-a-session-this-pool-issued");
    });

    // Then there is no challenge to present a passkey against.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a passkey read for a session that asked for no passkey", async () => {
    // Given a user offered its factors, which asked for no passkey in
    // particular.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);

    const offered = await userAuth(setUp);

    assertNonNullable(offered.Session);

    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When a test reads a credential for that session.
    const error = assertThrowsError(() => {
      pool.webAuthnAssertion(offered.Session ?? "");
    });

    // Then the session carries no options a passkey could be presented
    // against.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });
});

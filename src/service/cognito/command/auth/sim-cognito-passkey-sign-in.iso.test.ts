import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoPasskeyAssertion,
  simCognitoRegisterPasskey,
  simCognitoRelyingPartyId,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import type { SimCognitoSignedInSetUp } from "../../../../../test/cognito/signed-in-fixture.js";
import {
  simCognitoPassword,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";

/**
 * Start a choice-based sign-in, with the factor the request preferred where it
 * named one.
 */
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

describe("sim Cognito signing in with a passkey", () => {
  it("signs a user in with the passkey it registered", async () => {
    // Given a user of a pool that allows passkeys, holding one it registered
    // from its password session.
    const setUp = await simCognitoWithPasskeyPool();
    const registered = await simCognitoRegisterPasskey(setUp);

    // When it asks to sign in with that passkey and presents one.
    const challenged = await userAuth(setUp, "WEB_AUTHN");

    assertNonNullable(challenged.Session);

    const options: unknown = JSON.parse(
      challenged.ChallengeParameters?.["CREDENTIAL_REQUEST_OPTIONS"] ?? "",
    );
    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "WEB_AUTHN",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          CREDENTIAL: simCognitoPasskeyAssertion(setUp, challenged.Session),
        },
      }),
    );

    // Then the challenge asked for the passkey the user has, against the pool's
    // relying party, and the tokens a password sign-in issues come back.
    assertIdentical(challenged.ChallengeName, "WEB_AUTHN");
    assertNonNullable(options);
    assertIdentical(
      (options as { rpId?: string }).rpId,
      simCognitoRelyingPartyId,
    );
    assertIdentical(
      (options as { allowCredentials?: { id?: string }[] })
        .allowCredentials?.[0]?.id,
      registered.id,
    );
    const issued = signedIn.AuthenticationResult;

    assertNonNullable(issued);
    assertTypeString(issued.AccessToken);
    assertTypeString(issued.IdToken);
    assertTypeString(issued.RefreshToken);
  });

  it("offers the factors the pool allows and the user has", async () => {
    // Given a user of a pool allowing a password and a passkey, before and
    // after it registers one.
    const setUp = await simCognitoWithPasskeyPool();
    const withoutPasskey = await userAuth(setUp);

    await simCognitoRegisterPasskey(setUp);

    const withPasskey = await userAuth(setUp);

    // Then the choice grows with what the user has, and each offer carries a
    // session to come back with.
    assertIdentical(withoutPasskey.ChallengeName, "SELECT_CHALLENGE");
    assertArrayEquals(withoutPasskey.AvailableChallenges, ["PASSWORD"]);
    assertArrayEquals(withPasskey.AvailableChallenges, [
      "PASSWORD",
      "WEB_AUTHN",
    ]);
    assertTypeString(withPasskey.Session);
  });

  it("presents a passkey chosen from the offered factors", async () => {
    // Given a user offered its factors.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);

    const offered = await userAuth(setUp);

    assertNonNullable(offered.Session);

    // When it picks the passkey and presents one.
    const challenged = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "SELECT_CHALLENGE",
        Session: offered.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          ANSWER: "WEB_AUTHN",
        },
      }),
    );

    assertNonNullable(challenged.Session);

    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "WEB_AUTHN",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          CREDENTIAL: simCognitoPasskeyAssertion(setUp, challenged.Session),
        },
      }),
    );

    // Then picking the factor asks for it, and presenting it signs the user in.
    assertIdentical(challenged.ChallengeName, "WEB_AUTHN");
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
  });

  it("signs a user in with the password it chose", async () => {
    // Given a user offered its factors.
    const setUp = await simCognitoWithPasskeyPool();
    const offered = await userAuth(setUp);

    assertNonNullable(offered.Session);

    // When it picks the password and sends it in the same request.
    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "SELECT_CHALLENGE",
        Session: offered.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          ANSWER: "PASSWORD",
          PASSWORD: simCognitoPassword,
        },
      }),
    );

    // Then the sign-in finishes there, as it does on real Cognito.
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
  });

  it("signs a user in with a password sent to the choice-based flow", async () => {
    // Given a user of a pool that allows passkeys.
    const setUp = await simCognitoWithPasskeyPool();

    // When it starts a choice-based sign-in carrying its password.
    const signedIn = await setUp.cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: setUp.clientId,
        AuthFlow: "USER_AUTH",
        AuthParameters: {
          USERNAME: simCognitoUsername,
          PASSWORD: simCognitoPassword,
        },
      }),
    );

    // Then there is nothing left to choose, and the tokens come straight back.
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
  });

  it("asks for the password where that is the preferred factor", async () => {
    // Given a user of a pool that allows passkeys.
    const setUp = await simCognitoWithPasskeyPool();

    // When it asks to sign in with its password and answers the challenge.
    const challenged = await userAuth(setUp, "PASSWORD");

    assertNonNullable(challenged.Session);

    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "PASSWORD",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          PASSWORD: simCognitoPassword,
        },
      }),
    );

    // Then the password challenge is what stood between it and its tokens.
    assertIdentical(challenged.ChallengeName, "PASSWORD");
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
  });

  it("signs a user in with a passkey through the admin API", async () => {
    // Given a user of a pool that allows passkeys, holding one.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);

    // When a server-side sign-in asks for the passkey and presents it.
    const challenged = await setUp.cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: setUp.userPoolId,
        ClientId: setUp.clientId,
        AuthFlow: "USER_AUTH",
        AuthParameters: {
          USERNAME: simCognitoUsername,
          PREFERRED_CHALLENGE: "WEB_AUTHN",
        },
      }),
    );

    assertNonNullable(challenged.Session);

    const signedIn = await setUp.cognito.adminRespondToAuthChallenge(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId: setUp.userPoolId,
        ClientId: setUp.clientId,
        ChallengeName: "WEB_AUTHN",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          CREDENTIAL: simCognitoPasskeyAssertion(setUp, challenged.Session),
        },
      }),
    );

    // Then both sides of the API run the same flow.
    assertIdentical(challenged.ChallengeName, "WEB_AUTHN");
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
  });

  it("asks a user with a second factor for nothing more", async () => {
    // Given a user of a pool that offers MFA, registered for an authenticator
    // app as well as holding a passkey.
    const setUp = await simCognitoWithPasskeyPool();

    await simCognitoRegisterPasskey(setUp);
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
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // When it signs in with the passkey.
    const challenged = await userAuth(setUp, "WEB_AUTHN");

    assertNonNullable(challenged.Session);

    const signedIn = await setUp.cognito.respondToAuthChallenge(
      new RespondToAuthChallengeCommand({
        ClientId: setUp.clientId,
        ChallengeName: "WEB_AUTHN",
        Session: challenged.Session,
        ChallengeResponses: {
          USERNAME: simCognitoUsername,
          CREDENTIAL: simCognitoPasskeyAssertion(setUp, challenged.Session),
        },
      }),
    );

    // Then the tokens come back with no second factor asked for, because a
    // passkey has met that requirement as well.
    assertTypeString(signedIn.AuthenticationResult?.AccessToken);
    assertUndefined(signedIn.ChallengeName);
  });
});

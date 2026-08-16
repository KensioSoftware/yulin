import type { UserPoolMfaType } from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoWithClient {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool with the MFA configuration the test is about, and an app client both
 * sign-in flows can be run through.
 */
async function simCognitoWithClient(
  mfaConfiguration: UserPoolMfaType,
): Promise<SimCognitoWithClient> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      MfaConfiguration: mfaConfiguration,
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_ADMIN_USER_PASSWORD_AUTH",
      ],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * Sign a user up and confirm it, which is the flow a pool offering MFA is
 * built for.
 */
async function signUpAlice(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
  clientId: string,
): Promise<void> {
  await cognito.signUp(
    new SignUpCommand({
      ClientId: clientId,
      Username: "alice",
      Password: password,
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );

  await cognito.confirmSignUp(
    new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: "alice",
      ConfirmationCode: cognito.userPool(userPoolId).confirmationCode("alice"),
    }),
  );
}

describe("sim Cognito sign-in to a pool offering MFA", () => {
  it("signs a user of a pool offering MFA in with a password", async () => {
    // Given a pool offering MFA to users that ask for it, with a user that
    // signed itself up. Nothing here registers a second factor, so this user
    // has none, and neither would it on real Cognito.
    const { cognito, userPoolId, clientId } =
      await simCognitoWithClient("OPTIONAL");

    await signUpAlice(cognito, userPoolId, clientId);

    // When it signs in on both sides of the API.
    const admin = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );
    const client = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );

    // Then both hand out tokens, with no challenge in the way.
    assertNonNullable(admin.AuthenticationResult?.AccessToken);
    assertNonNullable(client.AuthenticationResult?.AccessToken);
  });

  it("refuses a sign-in a pool requiring MFA would challenge", async () => {
    // Given a pool that requires MFA of every user, with a confirmed user.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient("ON");

    await signUpAlice(cognito, userPoolId, clientId);

    // When that user signs in on either side of the API.
    const admin = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
      );
    });
    const client = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
      );
    });

    // Then both are refused where real Cognito would answer with the MFA
    // challenge, saying what it was that could not be done.
    for (const error of [admin, client]) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, userPoolId);
      assertStringIncludes(error.message, "would answer this sign-in with an");
      assertStringIncludes(error.message, "MFA challenge");
      assertStringIncludes(error.message, "not simulated");
    }
  });

  it("refuses a new password answered to a pool requiring MFA", async () => {
    // Given a pool requiring MFA, with a user that has to change its password
    // before it can sign in.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient("ON");

    await cognito.adminCreateUser({
      input: {
        UserPoolId: userPoolId,
        Username: "alice",
        TemporaryPassword: "Temp0rary!",
      },
    });

    const challenged = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
      }),
    );

    // Then the challenge it is answered with is the one this simulation does
    // issue, because real Cognito issues that one first.
    assertIdentical(challenged.ChallengeName, "NEW_PASSWORD_REQUIRED");

    // When the new password is sent back, which real Cognito answers with the
    // MFA challenge rather than with tokens.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminRespondToAuthChallenge(
        new AdminRespondToAuthChallengeCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          ChallengeName: "NEW_PASSWORD_REQUIRED",
          Session: challenged.Session,
          ChallengeResponses: {
            USERNAME: "alice",
            NEW_PASSWORD: password,
          },
        }),
      );
    });

    // Then it is refused there instead.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "MFA challenge");
  });
});

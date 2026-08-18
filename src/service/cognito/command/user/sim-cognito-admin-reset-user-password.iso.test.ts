import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  ConfirmForgotPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
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
import { SimCognitoPasswordResetRequiredException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";
const newPassword = "Ev3nBetter!";

interface SimCognitoWithSignedInUser {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool holding one user with a permanent password of its own.
 */
async function simCognitoWithSignedInUser(): Promise<SimCognitoWithSignedInUser> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: ["email"],
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      UserAttributes: [
        { Name: "email", Value: "alice@example.com" },
        { Name: "email_verified", Value: "true" },
      ],
    }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );

  return { cognito, userPoolId, clientId: client.UserPoolClient.ClientId };
}

async function signIn(
  cognito: SimCognitoIdentityProvider,
  clientId: string,
  candidate: string,
): Promise<string | undefined> {
  const signedIn = await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: candidate },
    }),
  );

  return signedIn.AuthenticationResult?.AccessToken;
}

describe("sim Cognito administrative password reset", () => {
  it("leaves the user in RESET_REQUIRED and refuses its sign-in", async () => {
    // Given a user signing in with a password of its own.
    const { cognito, userPoolId, clientId } =
      await simCognitoWithSignedInUser();

    assertNonNullable(await signIn(cognito, clientId, password));

    // When an administrator resets its password.
    await cognito.adminResetUserPassword(
      new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // Then the status says what is missing, and so does the sign-in it now
    // gets refused with.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "RESET_REQUIRED");

    const error = await assertThrowsErrorAsync(async () => {
      await signIn(cognito, clientId, password);
    });

    assertInstanceOf(error, SimCognitoPasswordResetRequiredException);
    assertStringIncludes(error.message, "Password reset required");
  });

  it("sends the code the user sets its next password with", async () => {
    // Given a user whose password an administrator has reset.
    const { cognito, userPoolId, clientId } =
      await simCognitoWithSignedInUser();

    await cognito.adminResetUserPassword(
      new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // When it answers with the code the pool would have sent it.
    const messages = cognito.userPool(userPoolId).sentMessages();
    const message = messages.at(-1);
    const code = cognito.userPool(userPoolId).confirmationCode("alice");

    assertNonNullable(code);

    await cognito.confirmForgotPassword(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: code,
        Password: newPassword,
      }),
    );

    // Then the last message the pool would have sent carried that code, after
    // the invitation the user was created with, and the user is confirmed and
    // signing in again with the password it chose.
    assertNonNullable(message);
    assertIdentical(message.occasion, "ForgotPassword");
    assertStringIncludes(message.body, code);

    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "CONFIRMED");
    assertNonNullable(await signIn(cognito, clientId, newPassword));
  });
});

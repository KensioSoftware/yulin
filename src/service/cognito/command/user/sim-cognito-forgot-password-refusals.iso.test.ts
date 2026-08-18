import {
  AdminCreateUserCommand,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
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
  makeResetPool,
  newResetPassword,
  resetCodeIn,
  resetPassword,
  resetUsername,
  simCognitoResetSecretHash,
} from "../../../../../test/cognito/password-reset-fixture.js";
import {
  SimCognitoCodeMismatchException,
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";

describe("sim Cognito forgotten password refusals", () => {
  it("reports an unknown user to an app client that leaks existence", async () => {
    // Given an app client left on the LEGACY default.
    const pool = await makeResetPool();

    // When a reset names a user the pool does not hold.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.forgotPassword(
        new ForgotPasswordCommand({
          ClientId: pool.clientId,
          Username: "mallory",
        }),
      );
    });

    // Then it says so, as real Cognito does under that setting.
    assertInstanceOf(error, SimCognitoUserNotFoundException);
  });

  it("hides an unknown user from an app client that prevents the error", async () => {
    // Given an app client with PreventUserExistenceErrors enabled.
    const pool = await makeResetPool({ preventUserExistenceErrors: "ENABLED" });

    // When a reset names a user the pool does not hold.
    const asked = await pool.cognito.forgotPassword(
      new ForgotPasswordCommand({
        ClientId: pool.clientId,
        Username: "mallory",
      }),
    );

    // Then it answers as though a code had gone out, so nothing about the
    // response says whether the account exists.
    assertNonNullable(asked.CodeDeliveryDetails);
    assertIdentical(asked.CodeDeliveryDetails.DeliveryMedium, "EMAIL");
    assertNonNullable(asked.CodeDeliveryDetails.Destination);
  });

  it("answers a confirmation for an unknown user as a wrong code", async () => {
    // Given an app client with PreventUserExistenceErrors enabled.
    const pool = await makeResetPool({ preventUserExistenceErrors: "ENABLED" });

    // When a confirmation names a user the pool does not hold.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.confirmForgotPassword(
        new ConfirmForgotPasswordCommand({
          ClientId: pool.clientId,
          Username: "mallory",
          ConfirmationCode: "000000",
          Password: newResetPassword,
        }),
      );
    });

    // Then the refusal is the one a wrong code gets, which says nothing about
    // whether the account exists.
    assertInstanceOf(error, SimCognitoCodeMismatchException);
  });

  it("refuses a user the pool has nowhere to send a code to", async () => {
    // Given a pool that verifies nothing, so no address is one it writes to.
    const pool = await makeResetPool({ autoVerifiedAttributes: [] });

    // When that user asks to reset its password.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.forgotPassword(
        new ForgotPasswordCommand({
          ClientId: pool.clientId,
          Username: resetUsername,
        }),
      );
    });

    // Then it is refused in the words real Cognito refuses with.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "no registered/verified email");
  });

  it("refuses a user that has still to replace a temporary password", async () => {
    // Given a user an administrator created and never gave a password of its
    // own.
    const pool = await makeResetPool();

    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "bob",
        TemporaryPassword: resetPassword,
        UserAttributes: [{ Name: "email", Value: "bob@example.com" }],
      }),
    );

    // When that user asks to reset its password.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.forgotPassword(
        new ForgotPasswordCommand({ ClientId: pool.clientId, Username: "bob" }),
      );
    });

    // Then it is sent to the new password challenge instead, as real Cognito
    // sends it.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(
      error.message,
      "User password cannot be reset in the current state.",
    );
  });

  it("wants a SECRET_HASH from an app client with a secret", async () => {
    // Given a pool whose app client was created with a secret.
    const pool = await makeResetPool({ generateSecret: true });

    assertNonNullable(pool.clientSecret);

    // When a reset arrives without one.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.forgotPassword(
        new ForgotPasswordCommand({
          ClientId: pool.clientId,
          Username: resetUsername,
        }),
      );
    });

    // Then both operations are refused until the hash the SDKs compute gets
    // in.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Unable to verify secret hash");

    const secretHash = simCognitoResetSecretHash(
      pool.clientId,
      pool.clientSecret,
    );

    await pool.cognito.forgotPassword(
      new ForgotPasswordCommand({
        ClientId: pool.clientId,
        Username: resetUsername,
        SecretHash: secretHash,
      }),
    );

    const unhashed = await assertThrowsErrorAsync(async () => {
      await pool.cognito.confirmForgotPassword(
        new ConfirmForgotPasswordCommand({
          ClientId: pool.clientId,
          Username: resetUsername,
          ConfirmationCode: resetCodeIn(pool),
          Password: newResetPassword,
        }),
      );
    });

    assertInstanceOf(unhashed, SimCognitoNotAuthorizedException);
    assertStringIncludes(unhashed.message, "Unable to verify secret hash");

    await pool.cognito.confirmForgotPassword(
      new ConfirmForgotPasswordCommand({
        ClientId: pool.clientId,
        Username: resetUsername,
        ConfirmationCode: resetCodeIn(pool),
        Password: newResetPassword,
        SecretHash: secretHash,
      }),
    );
  });
});

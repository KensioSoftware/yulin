import {
  AdminGetUserCommand,
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
  signResetUserIn,
  type SimCognitoResetPool,
} from "../../../../../test/cognito/password-reset-fixture.js";
import {
  SimCognitoCodeMismatchException,
  SimCognitoExpiredCodeException,
  SimCognitoInvalidPasswordException,
  SimCognitoNotAuthorizedException,
} from "../../error/sim-cognito.error.js";

async function askToReset(pool: SimCognitoResetPool): Promise<void> {
  await pool.cognito.forgotPassword(
    new ForgotPasswordCommand({
      ClientId: pool.clientId,
      Username: resetUsername,
    }),
  );
}

async function resetWith(
  pool: SimCognitoResetPool,
  code: string | undefined,
  password: string,
): Promise<void> {
  await pool.cognito.confirmForgotPassword(
    new ConfirmForgotPasswordCommand({
      ClientId: pool.clientId,
      Username: resetUsername,
      ConfirmationCode: code,
      Password: password,
    }),
  );
}

async function statusOf(
  pool: SimCognitoResetPool,
): Promise<string | undefined> {
  const read = await pool.cognito.adminGetUser(
    new AdminGetUserCommand({
      UserPoolId: pool.userPoolId,
      Username: resetUsername,
    }),
  );

  return read.UserStatus;
}

describe("sim Cognito forgotten password reset", () => {
  it("resets a forgotten password and signs in with the new one", async () => {
    // Given a confirmed user that has forgotten its password.
    const pool = await makeResetPool();

    // When it asks for a code and answers with a password of its own.
    const asked = await pool.cognito.forgotPassword(
      new ForgotPasswordCommand({
        ClientId: pool.clientId,
        Username: resetUsername,
      }),
    );

    await resetWith(pool, resetCodeIn(pool), newResetPassword);

    // Then the pool said where the code went, without saying the address in
    // full, and the new password is the one that signs in.
    assertNonNullable(asked.CodeDeliveryDetails);
    assertIdentical(asked.CodeDeliveryDetails.DeliveryMedium, "EMAIL");
    assertIdentical(asked.CodeDeliveryDetails.AttributeName, "email");
    assertIdentical(asked.CodeDeliveryDetails.Destination, "a***@e***.com");
    assertIdentical(await statusOf(pool), "CONFIRMED");
    assertNonNullable(await signResetUserIn(pool, newResetPassword));
  });

  it("stops the old password working once the new one is set", async () => {
    // Given a user that has reset its password.
    const pool = await makeResetPool();

    await askToReset(pool);
    await resetWith(pool, resetCodeIn(pool), newResetPassword);

    // When it tries the password it had before.
    const error = await assertThrowsErrorAsync(async () => {
      await signResetUserIn(pool, resetPassword);
    });

    // Then it is refused as any other wrong password is.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Incorrect username or password.");
  });

  it("refuses a code that is not the one it issued", async () => {
    // Given a user waiting to answer with a reset code.
    const pool = await makeResetPool();

    await askToReset(pool);

    // When it answers with a code the pool never issued.
    const error = await assertThrowsErrorAsync(async () => {
      await resetWith(pool, "000000", newResetPassword);
    });

    // Then nothing is reset, and the old password still signs it in.
    assertInstanceOf(error, SimCognitoCodeMismatchException);
    assertNonNullable(await signResetUserIn(pool, resetPassword));
  });

  it("issues a second code and forgets the first", async () => {
    // Given a user that has asked to reset twice.
    const pool = await makeResetPool();

    await askToReset(pool);

    const first = resetCodeIn(pool);

    await askToReset(pool);

    // When it answers with the code it was sent first.
    const error = await assertThrowsErrorAsync(async () => {
      await resetWith(pool, first, newResetPassword);
    });

    // Then that one is refused, and the code it was sent second works.
    assertInstanceOf(error, SimCognitoCodeMismatchException);
    await resetWith(pool, resetCodeIn(pool), newResetPassword);
    assertNonNullable(await signResetUserIn(pool, newResetPassword));
  });

  it("spends the code, so it resets nothing twice", async () => {
    // Given a user that has already reset with the code it was sent.
    const pool = await makeResetPool();

    await askToReset(pool);

    const code = resetCodeIn(pool);

    await resetWith(pool, code, newResetPassword);

    // When the same code is used again.
    const error = await assertThrowsErrorAsync(async () => {
      await resetWith(pool, code, "Third0ne!");
    });

    // Then it is refused as expired, which is what real Cognito calls a code
    // it will no longer take.
    assertInstanceOf(error, SimCognitoExpiredCodeException);
  });

  it("holds a new password to the pool's password policy", async () => {
    // Given a user waiting to answer with a reset code.
    const pool = await makeResetPool();

    await askToReset(pool);

    // When it chooses a password the pool's policy refuses.
    const error = await assertThrowsErrorAsync(async () => {
      await resetWith(pool, resetCodeIn(pool), "short");
    });

    // Then it is refused with the rule it broke.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "Password not long enough");
  });
});

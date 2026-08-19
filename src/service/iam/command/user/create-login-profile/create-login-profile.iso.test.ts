import {
  CreateLoginProfileCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import {
  SimIamEntityAlreadyExists,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamUsername } from "../../../user/sim-iam-user.js";

describe("IAM CreateLoginProfileCommand", () => {
  it("gives a User a console password without reporting it back", async () => {
    // Given an IAM User.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "ConsoleUser" }));

    // When the User is given a login profile.
    const profileCreation = await simIam.createLoginProfile(
      new CreateLoginProfileCommand({
        UserName: "ConsoleUser",
        Password: "initial-console-password",
        PasswordResetRequired: true,
      }),
    );

    // Then the response describes the profile without the password.
    assertIdentical(profileCreation.LoginProfile.UserName, "ConsoleUser");
    assertTrue(profileCreation.LoginProfile.PasswordResetRequired);
    assertInstanceOf(profileCreation.LoginProfile.CreateDate, Date);

    // And the password itself is only reachable through the User record.
    const user = simIam.users.get("ConsoleUser" as SimIamUsername);

    assertNonNullable(user?.loginProfile);
    assertIdentical(user.loginProfile.password, "initial-console-password");
    assertTrue(user.loginProfile.passwordResetRequired);
  });

  it("defaults PasswordResetRequired to false", async () => {
    // Given an IAM User.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "ConsoleUser" }));

    // When a login profile is created without PasswordResetRequired.
    const profileCreation = await simIam.createLoginProfile(
      new CreateLoginProfileCommand({
        UserName: "ConsoleUser",
        Password: "initial-console-password",
      }),
    );

    // Then the User is not asked to change the password at sign-in.
    assertFalse(profileCreation.LoginProfile.PasswordResetRequired);
  });

  it("refuses a second login profile for the same User", async () => {
    // Given a User that already has a login profile.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "ConsoleUser" }));
    await simIam.createLoginProfile(
      new CreateLoginProfileCommand({
        UserName: "ConsoleUser",
        Password: "initial-console-password",
      }),
    );

    // When another login profile is created for it.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createLoginProfile(
        new CreateLoginProfileCommand({
          UserName: "ConsoleUser",
          Password: "another-console-password",
        }),
      ),
    );

    // Then IAM refuses, as it does for any entity that already exists.
    assertInstanceOf(error, SimIamEntityAlreadyExists);
  });

  it("throws when the IAM User does not exist", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.createLoginProfile(
        new CreateLoginProfileCommand({
          UserName: "MissingUser",
          Password: "initial-console-password",
        }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(error.message, "No IAM User with name MissingUser");
  });

  it("requires a UserName and a Password", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "ConsoleUser" }));

    const missingUsername = await assertThrowsErrorAsync(async () =>
      simIam.createLoginProfile(
        new CreateLoginProfileCommand({
          UserName: undefined,
          Password: "console-password",
        }),
      ),
    );

    assertIdentical(missingUsername.message, "UserName is required");

    const missingPassword = await assertThrowsErrorAsync(async () =>
      simIam.createLoginProfile(
        new CreateLoginProfileCommand({
          UserName: "ConsoleUser",
          Password: undefined,
        }),
      ),
    );

    assertIdentical(missingPassword.message, "Password is required");
  });
});

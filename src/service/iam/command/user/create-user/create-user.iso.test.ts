import { CreateUserCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringLength,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

describe("IAM CreateUserCommand", () => {
  it("creates an IAM User through the SimIam service", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    // When an IAM User is created.
    const userCreation = await simIam.createUser(
      new CreateUserCommand({
        UserName: "TestUser",
        Path: "/application/",
      }),
    );

    // Then the important User metadata is returned.
    assertIdentical(userCreation.User.UserName, "TestUser");
    assertIdentical(userCreation.User.Path, "/application/");
    assertIdentical(
      userCreation.User.Arn,
      `arn:aws:iam::${accountId}:user/application/TestUser`,
    );
    assertStringLength(userCreation.User.UserId, 20);
    assertInstanceOf(userCreation.User.CreateDate, Date);
  });

  it("defaults the IAM User path", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    // When an IAM User is created without a path.
    const userCreation = await simIam.createUser(
      new CreateUserCommand({
        UserName: "DefaultPathUser",
      }),
    );

    // Then the root path is used in the returned User.
    assertIdentical(userCreation.User.Path, "/");
    assertIdentical(
      userCreation.User.Arn,
      `arn:aws:iam::${accountId}:user/DefaultPathUser`,
    );
  });

  it("normalises IAM User paths", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    // When Users are created with differently formatted paths.
    const withoutSlashes = await simIam.createUser(
      new CreateUserCommand({
        UserName: "WithoutSlashes",
        Path: "application",
      }),
    );
    const withoutTrailingSlash = await simIam.createUser(
      new CreateUserCommand({
        UserName: "WithoutTrailingSlash",
        Path: "/service-role",
      }),
    );
    const emptyPath = await simIam.createUser(
      new CreateUserCommand({
        UserName: "EmptyPath",
        Path: "",
      }),
    );

    // Then the returned paths and ARNs use normalised path forms.
    assertIdentical(withoutSlashes.User.Path, "/application/");
    assertIdentical(
      withoutSlashes.User.Arn,
      `arn:aws:iam::${accountId}:user/application/WithoutSlashes`,
    );
    assertIdentical(withoutTrailingSlash.User.Path, "/service-role/");
    assertIdentical(
      withoutTrailingSlash.User.Arn,
      `arn:aws:iam::${accountId}:user/service-role/WithoutTrailingSlash`,
    );
    assertIdentical(emptyPath.User.Path, "/");
    assertIdentical(
      emptyPath.User.Arn,
      `arn:aws:iam::${accountId}:user/EmptyPath`,
    );
  });

  it("uses the SimAws default account ID when building the IAM User ARN", async () => {
    // Given SimAws has a custom default account ID.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
    });
    const simIam = simAws.iam();

    // When a User is created through the default account service.
    const userCreation = await simIam.createUser(
      new CreateUserCommand({
        UserName: "AccountScopedUser",
        Path: "/application/",
      }),
    );

    // Then the User ARN includes the custom default account ID.
    assertIdentical(
      userCreation.User.Arn,
      `arn:aws:iam::${accountId}:user/application/AccountScopedUser`,
    );
  });

  it("throws when UserName is undefined", async () => {
    // Given an IAM service.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When CreateUser is called without a UserName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createUser(
        new CreateUserCommand({
          UserName: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "UserName is required");
  });

  it("throws when UserName is empty", async () => {
    // Given an IAM service.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When CreateUser is called with an empty UserName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createUser(
        new CreateUserCommand({
          UserName: "",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "UserName is required");
  });

  it("throws when creating a duplicate IAM User", async () => {
    // Given an IAM User already exists.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    await simIam.createUser(
      new CreateUserCommand({
        UserName: "DuplicateUser",
        Path: "/application/",
      }),
    );

    // When another User is created with the same name in a different path.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createUser(
        new CreateUserCommand({
          UserName: "DuplicateUser",
          Path: "/service-role/",
        }),
      ),
    );

    // Then IAM reports that the entity already exists.
    assertIdentical(
      error.message,
      "Sim IAM User already exists: DuplicateUser",
    );
  });
});

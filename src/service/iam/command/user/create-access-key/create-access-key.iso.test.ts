import { CreateAccessKeyCommand, CreateUserCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringLength,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";

describe("IAM CreateAccessKeyCommand", () => {
  it("creates an active access key for an IAM User", async () => {
    // Given an IAM User in a known account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "ApplicationUser",
      }),
    );

    // When an access key is created for the User.
    const output = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "ApplicationUser",
      }),
    );

    // Then active AWS-shaped credentials are returned.
    assertIdentical(output.AccessKey.UserName, "ApplicationUser");
    assertIdentical(output.AccessKey.Status, "Active");
    assertStringLength(output.AccessKey.AccessKeyId, 20);
    assertStringLength(output.AccessKey.SecretAccessKey, 40);
    assertInstanceOf(output.AccessKey.CreateDate, Date);
  });

  it("registers the access key for credential authentication", async () => {
    // Given an IAM User in a known account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "AuthenticatedUser",
        Path: "/application/",
      }),
    );

    // When an access key is created and used to resolve credentials.
    const output = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "AuthenticatedUser",
      }),
    );
    const identity = simIam.credentials.resolveCredentials({
      accessKeyId: output.AccessKey.AccessKeyId,
      secretAccessKey: output.AccessKey.SecretAccessKey,
    });

    // Then IAM resolves the credentials to the created User.
    assertObjectEquals(identity.principal, {
      kind: "arn",
      arn: `arn:aws:iam::${accountId}:user/application/AuthenticatedUser`,
    });
    assertObjectEquals(identity.identityPolicyPrincipal, identity.principal);
  });

  it("throws when UserName is undefined", async () => {
    // Given an IAM service.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When CreateAccessKey is called without a UserName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createAccessKey(
        new CreateAccessKeyCommand({
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

    // When CreateAccessKey is called with an empty UserName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createAccessKey(
        new CreateAccessKeyCommand({
          UserName: "",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "UserName is required");
  });

  it("throws when the IAM User does not exist", async () => {
    // Given an IAM service without the requested User.
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When an access key is requested for the missing User.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createAccessKey(
        new CreateAccessKeyCommand({
          UserName: "MissingUser",
        }),
      ),
    );

    // Then IAM reports that the User does not exist.
    assertIdentical(error.message, "Sim IAM User does not exist: MissingUser");
  });
});

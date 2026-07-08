import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringLength,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

describe("IAM CreateRoleCommand", () => {
  it("creates an IAM Role through the top-level SimIam service", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    // When an IAM Role is created.
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TestRole",
        Path: "/service-role/",
        Description: "Role used by CreateRoleCommand tests",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    // Then the Role metadata is returned.
    assertIdentical(createRoleOutput.Role.RoleName, "TestRole");
    assertIdentical(createRoleOutput.Role.Path, "/service-role/");
    assertIdentical(
      createRoleOutput.Role.Description,
      "Role used by CreateRoleCommand tests",
    );
    assertIdentical(
      createRoleOutput.Role.Arn,
      "arn:aws:iam::123456789012:role/service-role/TestRole",
    );
    assertStringLength(createRoleOutput.Role.RoleId, 21);
    assertNonNullable(createRoleOutput.Role.AssumeRolePolicyDocument);
    assertInstanceOf(createRoleOutput.Role.CreateDate, Date);
  });

  it("defaults optional values when creating an IAM Role", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    // When an IAM Role is created with optional fields omitted.
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DefaultedRole",
        AssumeRolePolicyDocument: undefined,
      }),
    );

    // Then default Role values are returned.
    assertIdentical(createRoleOutput.Role.RoleName, "DefaultedRole");
    assertIdentical(createRoleOutput.Role.Path, "/");
    assertIdentical(
      createRoleOutput.Role.Arn,
      "arn:aws:iam::123456789012:role/DefaultedRole",
    );
    assertStringLength(createRoleOutput.Role.RoleId, 21);
    assertUndefined(createRoleOutput.Role.Description);
    assertUndefined(createRoleOutput.Role.AssumeRolePolicyDocument);
    assertInstanceOf(createRoleOutput.Role.CreateDate, Date);
  });

  it("normalises IAM Role paths", async () => {
    // Given an IAM service in a known account.
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    // When Roles are created with differently formatted paths.
    const withoutSlashes = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "WithoutSlashes",
        Path: "application",
        AssumeRolePolicyDocument: undefined,
      }),
    );
    const withoutTrailingSlash = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "WithoutTrailingSlash",
        Path: "/service-role",
        AssumeRolePolicyDocument: undefined,
      }),
    );
    const emptyPath = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "EmptyPath",
        Path: "",
        AssumeRolePolicyDocument: undefined,
      }),
    );

    // Then Role paths and ARNs use the normalised path forms.
    assertIdentical(withoutSlashes.Role.Path, "/application/");
    assertIdentical(
      withoutSlashes.Role.Arn,
      "arn:aws:iam::123456789012:role/application/WithoutSlashes",
    );
    assertIdentical(withoutTrailingSlash.Role.Path, "/service-role/");
    assertIdentical(
      withoutTrailingSlash.Role.Arn,
      "arn:aws:iam::123456789012:role/service-role/WithoutTrailingSlash",
    );
    assertIdentical(emptyPath.Role.Path, "/");
    assertIdentical(
      emptyPath.Role.Arn,
      "arn:aws:iam::123456789012:role/EmptyPath",
    );
  });

  it("uses the SimAws default account ID when building the IAM Role ARN", async () => {
    // Given SimAws has a custom default account ID.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
    });

    const simIam = simAws.iam();

    // When a Role is created through the default account service.
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "AccountScopedRole",
        Path: "/application/",
        AssumeRolePolicyDocument: undefined,
      }),
    );

    // Then the Role ARN includes the custom default account ID.
    assertIdentical(
      createRoleOutput.Role.Arn,
      `arn:aws:iam::${accountId}:role/application/AccountScopedRole`,
    );
  });

  it("throws when RoleName is undefined", async () => {
    // Given an IAM service.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    // When CreateRole is called without a RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createRole(
        new CreateRoleCommand({
          RoleName: undefined,
          AssumeRolePolicyDocument: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when RoleName is empty", async () => {
    // Given an IAM service.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    // When CreateRole is called with an empty RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createRole(
        new CreateRoleCommand({
          RoleName: "",
          AssumeRolePolicyDocument: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws when creating a duplicate IAM Role", async () => {
    // Given an IAM Role already exists.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DuplicateRole",
        Path: "/application/",
        AssumeRolePolicyDocument: undefined,
      }),
    );

    // When another Role is created with the same name.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.createRole(
        new CreateRoleCommand({
          RoleName: "DuplicateRole",
          Path: "/service-role/",
          AssumeRolePolicyDocument: undefined,
        }),
      ),
    );

    // Then IAM reports that the entity already exists.
    assertIdentical(
      error.message,
      "Sim IAM Role already exists: DuplicateRole",
    );
  });
});

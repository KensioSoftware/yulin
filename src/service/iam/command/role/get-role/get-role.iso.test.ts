import { CreateRoleCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

describe("IAM GetRoleCommand", () => {
  it("gets an IAM Role through the top-level SimIam service", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TestRole",
        Path: "/service-role/",
        Description: "Role used by GetRoleCommand tests",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      }),
    );

    assertNonNullable(roleCreation.Role.RoleName);

    // When we request the Role by name.
    const roleOut = await simIam.getRole(
      new GetRoleCommand({
        RoleName: roleCreation.Role.RoleName,
      }),
    );

    // Then the stored Role metadata is returned.
    assertIdentical(roleOut.Role.RoleName, "TestRole");
    assertIdentical(roleOut.Role.Path, "/service-role/");
    assertIdentical(
      roleOut.Role.Arn,
      "arn:aws:iam::123456789012:role/service-role/TestRole",
    );
    assertIdentical(
      roleOut.Role.Description,
      "Role used by GetRoleCommand tests",
    );
    assertIdentical(roleOut.Role.RoleId, roleCreation.Role.RoleId);
    assertIdentical(roleOut.Role.Arn, roleCreation.Role.Arn);
    assertIdentical(
      roleOut.Role.AssumeRolePolicyDocument,
      roleCreation.Role.AssumeRolePolicyDocument,
    );
    assertInstanceOf(roleOut.Role.CreateDate, Date);
    assertIdentical(roleOut.Role.CreateDate, roleCreation.Role.CreateDate);
  });

  it("throws on undefined RoleName", async () => {
    // Given an IAM service.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    // When we request a Role without a RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.getRole(
        new GetRoleCommand({
          RoleName: undefined,
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws on empty RoleName", async () => {
    // Given an IAM service.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    // When a Role is requested with an empty RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.getRole(
        new GetRoleCommand({
          RoleName: "",
        }),
      ),
    );

    // Then the request is rejected.
    assertIdentical(error.message, "RoleName is required");
  });

  it("throws on getting a non-existent IAM Role", async () => {
    // Given an IAM service with no matching Role.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    // When a missing Role is requested.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.getRole(
        new GetRoleCommand({
          RoleName: "MissingRole",
        }),
      ),
    );

    // Then IAM reports that the entity does not exist.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });
});

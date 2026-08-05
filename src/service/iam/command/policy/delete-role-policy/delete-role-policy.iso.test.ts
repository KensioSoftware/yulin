import {
  CreateRoleCommand,
  DeleteRolePolicyCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertFalse,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamRoleName } from "../../../role/sim-iam-role.js";
import { SimIam } from "../../../sim-iam.js";

const trustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

const policyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "s3:ListBucket", Resource: "*" },
});

describe("IAM DeleteRolePolicyCommand", () => {
  it("removes the inline policy PutRolePolicy stored", async () => {
    // Given a Role carrying an inline policy.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineRole",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineRole",
        PolicyName: "Removable",
        PolicyDocument: policyDocument,
      }),
    );

    const role = simIam.roles.get("InlineRole" as SimIamRoleName);
    assertTrue(role?.inlinePolicies.has("Removable"));

    // When the inline policy is deleted.
    await simIam.deleteRolePolicy(
      new DeleteRolePolicyCommand({
        RoleName: "InlineRole",
        PolicyName: "Removable",
      }),
    );

    // Then the Role no longer carries it.
    assertFalse(role.inlinePolicies.has("Removable"));
  });

  it("rejects a policy name the Role does not carry", async () => {
    // Given a Role with no inline policies.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PlainRole",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );

    // When a policy name it does not have is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRolePolicy(
        new DeleteRolePolicyCommand({
          RoleName: "PlainRole",
          PolicyName: "NeverPut",
        }),
      ),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
    assertStringIncludes(error.message, "No inline IAM Policy named NeverPut");
  });

  it("rejects a Role that does not exist", async () => {
    // Given an IAM Account without the requested Role.
    const simIam = new SimIam();

    // When an inline policy is deleted from the missing Role.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRolePolicy(
        new DeleteRolePolicyCommand({
          RoleName: "Absent",
          PolicyName: "Whatever",
        }),
      ),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("rejects missing required inputs", async () => {
    // Given an IAM Account.
    const simIam = new SimIam();

    // When DeleteRolePolicy is called without a RoleName.
    const roleError = await assertThrowsErrorAsync(async () =>
      simIam.deleteRolePolicy(
        // @ts-expect-error -- testing invalid input
        new DeleteRolePolicyCommand({ PolicyName: "Some" }),
      ),
    );

    // And without a PolicyName.
    const policyError = await assertThrowsErrorAsync(async () =>
      simIam.deleteRolePolicy(
        // @ts-expect-error -- testing invalid input
        new DeleteRolePolicyCommand({ RoleName: "SomeRole" }),
      ),
    );

    // Then request validation identifies each missing input.
    assertStringIncludes(roleError.message, "RoleName is required");
    assertStringIncludes(policyError.message, "PolicyName is required");
  });
});

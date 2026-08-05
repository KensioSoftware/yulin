import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  DetachRolePolicyCommand,
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

describe("IAM DetachRolePolicyCommand", () => {
  it("removes the attachment the Role carried", async () => {
    // Given a Role with a managed policy attached.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "AttachedRole",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Detachable",
        PolicyDocument: policyDocument,
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "AttachedRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    const role = simIam.roles.get("AttachedRole" as SimIamRoleName);
    assertTrue(role?.attachedPolicyArns.has(policy.Policy.Arn));

    // When the policy is detached.
    await simIam.detachRolePolicy(
      new DetachRolePolicyCommand({
        RoleName: "AttachedRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    // Then the attachment is gone, and the managed policy itself remains.
    assertFalse(role.attachedPolicyArns.has(policy.Policy.Arn));
    assertTrue(simIam.policies.has(policy.Policy.Arn));
  });

  it("rejects a policy the Role does not carry", async () => {
    // Given a Role with nothing attached.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnattachedRole",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );

    // When a policy that is not attached is detached.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.detachRolePolicy(
        new DetachRolePolicyCommand({
          RoleName: "UnattachedRole",
          PolicyArn: "arn:aws:iam::111111111111:policy/NeverAttached",
        }),
      ),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
    assertStringIncludes(error.message, "is not attached to Role");
  });

  it("rejects a Role that does not exist", async () => {
    // Given an IAM Account without the requested Role.
    const simIam = new SimIam();

    // When a policy is detached from the missing Role.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.detachRolePolicy(
        new DetachRolePolicyCommand({
          RoleName: "Absent",
          PolicyArn: "arn:aws:iam::111111111111:policy/Whatever",
        }),
      ),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("rejects missing required inputs", async () => {
    // Given an IAM Account.
    const simIam = new SimIam();

    // When DetachRolePolicy is called without a RoleName.
    const roleError = await assertThrowsErrorAsync(async () =>
      simIam.detachRolePolicy(
        // @ts-expect-error -- testing invalid input
        new DetachRolePolicyCommand({ PolicyArn: "arn:aws:iam::1:policy/P" }),
      ),
    );

    // And without a PolicyArn.
    const policyError = await assertThrowsErrorAsync(async () =>
      simIam.detachRolePolicy(
        // @ts-expect-error -- testing invalid input
        new DetachRolePolicyCommand({ RoleName: "SomeRole" }),
      ),
    );

    // Then request validation identifies each missing input.
    assertStringIncludes(roleError.message, "RoleName is required");
    assertStringIncludes(policyError.message, "PolicyArn is required");
  });
});

import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIam } from "../../../sim-iam.js";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamRoleName } from "../../../role/sim-iam-role.js";

const trustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

async function givenRole(simIam: SimIam, roleName: string): Promise<void> {
  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: trustPolicy,
    }),
  );
}

describe("IAM DeleteRoleCommand", () => {
  it("deletes a Role that has no policies on it", async () => {
    // Given a Role with nothing attached to it.
    const simIam = new SimIam();
    await givenRole(simIam, "BareRole");

    // When the Role is deleted.
    await simIam.deleteRole(new DeleteRoleCommand({ RoleName: "BareRole" }));

    // Then IAM no longer has it.
    assertUndefined(simIam.roles.get("BareRole" as SimIamRoleName));

    const error = await assertThrowsErrorAsync(async () =>
      simIam.getRole(new GetRoleCommand({ RoleName: "BareRole" })),
    );
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("refuses a Role that still has an inline policy", async () => {
    // Given a Role carrying an inline policy.
    const simIam = new SimIam();
    await givenRole(simIam, "InlinePolicyRole");
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlinePolicyRole",
        PolicyName: "ReadBuckets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "*",
          },
        }),
      }),
    );

    // When the Role is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRole(
        new DeleteRoleCommand({ RoleName: "InlinePolicyRole" }),
      ),
    );

    // Then IAM refuses, as it does until the policies are removed.
    assertInstanceOf(error, SimIamDeleteConflict);
    assertIdentical(error.$metadata.httpStatusCode, 409);
    assertStringIncludes(error.message, "must detach all policies first");
  });

  it("refuses a Role that still has a managed policy attached", async () => {
    // Given a Role with a managed policy attached to it.
    const simIam = new SimIam();
    await givenRole(simIam, "AttachedPolicyRole");
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ListBuckets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "*",
          },
        }),
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "AttachedPolicyRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    // When the Role is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRole(
        new DeleteRoleCommand({ RoleName: "AttachedPolicyRole" }),
      ),
    );

    // Then IAM refuses.
    assertInstanceOf(error, SimIamDeleteConflict);
  });

  it("deletes a Role once its policies have been removed", async () => {
    // Given a Role whose inline and managed policies have both been removed.
    const simIam = new SimIam();
    await givenRole(simIam, "EmptiedRole");
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Emptied",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "*",
          },
        }),
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "EmptiedRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "EmptiedRole",
        PolicyName: "Inline",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:ListBucket",
            Resource: "*",
          },
        }),
      }),
    );

    // When both are removed and the Role is deleted.
    await simIam.detachRolePolicy(
      new DetachRolePolicyCommand({
        RoleName: "EmptiedRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );
    await simIam.deleteRolePolicy(
      new DeleteRolePolicyCommand({
        RoleName: "EmptiedRole",
        PolicyName: "Inline",
      }),
    );
    await simIam.deleteRole(new DeleteRoleCommand({ RoleName: "EmptiedRole" }));

    // Then the Role is gone.
    assertUndefined(simIam.roles.get("EmptiedRole" as SimIamRoleName));
  });

  it("rejects a Role that does not exist", async () => {
    // Given an IAM Account without the requested Role.
    const simIam = new SimIam();

    // When the missing Role is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRole(new DeleteRoleCommand({ RoleName: "Absent" })),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("rejects a missing required RoleName input", async () => {
    // Given an IAM Account.
    const simIam = new SimIam();

    // When DeleteRole is called without its required RoleName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteRole(
        // @ts-expect-error -- testing invalid input
        new DeleteRoleCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(error.message, "RoleName is required");
  });
});

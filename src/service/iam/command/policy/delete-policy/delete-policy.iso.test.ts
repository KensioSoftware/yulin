import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  DeletePolicyCommand,
  DetachRolePolicyCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import { SimIam } from "../../../sim-iam.js";

const policyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "s3:ListBucket", Resource: "*" },
});

const trustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

describe("IAM DeletePolicyCommand", () => {
  it("deletes a managed policy nothing is attached to", async () => {
    // Given a managed policy with no attachments.
    const simIam = new SimIam();
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Unused",
        PolicyDocument: policyDocument,
      }),
    );

    // When the policy is deleted.
    await simIam.deletePolicy(
      new DeletePolicyCommand({ PolicyArn: policy.Policy.Arn }),
    );

    // Then IAM no longer has it.
    assertFalse(simIam.policies.has(policy.Policy.Arn));

    const error = await assertThrowsErrorAsync(async () =>
      simIam.getPolicy(new GetPolicyCommand({ PolicyArn: policy.Policy.Arn })),
    );
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("refuses a policy that is still attached to a Role", async () => {
    // Given a managed policy attached to a Role.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "HolderRole",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "StillAttached",
        PolicyDocument: policyDocument,
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "HolderRole",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    // When the policy is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deletePolicy(
        new DeletePolicyCommand({ PolicyArn: policy.Policy.Arn }),
      ),
    );

    // Then IAM refuses while an identity still carries it.
    assertInstanceOf(error, SimIamDeleteConflict);
    assertIdentical(error.$metadata.httpStatusCode, 409);
    assertStringIncludes(error.message, "attached to entities");
  });

  it("deletes a policy once it has been detached", async () => {
    // Given a managed policy that has been detached from its Role.
    const simIam = new SimIam();
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "FormerHolder",
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Detached",
        PolicyDocument: policyDocument,
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "FormerHolder",
        PolicyArn: policy.Policy.Arn,
      }),
    );
    await simIam.detachRolePolicy(
      new DetachRolePolicyCommand({
        RoleName: "FormerHolder",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    // When the policy is deleted.
    await simIam.deletePolicy(
      new DeletePolicyCommand({ PolicyArn: policy.Policy.Arn }),
    );

    // Then it goes, because nothing carries it any more.
    assertFalse(simIam.policies.has(policy.Policy.Arn));
  });

  it("rejects a policy that does not exist", async () => {
    // Given an IAM Account without the requested policy.
    const simIam = new SimIam();

    // When the missing policy is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deletePolicy(
        new DeletePolicyCommand({
          PolicyArn: "arn:aws:iam::111111111111:policy/Absent",
        }),
      ),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("rejects a missing required PolicyArn input", async () => {
    // Given an IAM Account.
    const simIam = new SimIam();

    // When DeletePolicy is called without its required PolicyArn.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deletePolicy(
        // @ts-expect-error -- testing invalid input
        new DeletePolicyCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(error.message, "PolicyArn is required");
  });
});

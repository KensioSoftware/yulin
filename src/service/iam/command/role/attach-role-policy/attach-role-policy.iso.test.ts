import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
} from "@aws-sdk/client-iam";
import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

const trustPolicy = (accountId: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    ],
  });

describe("IAM AttachRolePolicyCommand", () => {
  it("grants a Role access through an attached managed policy", async () => {
    // Given a managed policy and a Role.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const createPolicyOutput = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadReports",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::reports-bucket/*",
            },
          ],
        }),
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportsReader",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );

    // And the Role has no access before attachment.
    const beforeDecision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports-bucket/daily.json",
    });

    assertFalse(beforeDecision.isAllowed);

    // When the managed policy is attached to the Role.
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ReportsReader",
        PolicyArn: createPolicyOutput.Policy.Arn,
      }),
    );

    // Then the attached managed policy grants the Role access.
    const afterDecision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports-bucket/daily.json",
    });

    assertTrue(afterDecision.isAllowed);
    assertIdentical(afterDecision.value, "Allow");
  });

  it("resolves the current managed policy document at evaluation time", async () => {
    // Given a Role with a managed policy attached that grants access to one
    // resource but not another.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const createPolicyOutput = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ScopedRead",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::allowed-bucket/*",
            },
          ],
        }),
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ScopedReader",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );

    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ScopedReader",
        PolicyArn: createPolicyOutput.Policy.Arn,
      }),
    );

    // When the Role accesses a resource inside the policy scope.
    const allowedDecision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::allowed-bucket/object.txt",
    });

    // Then it is allowed.
    assertTrue(allowedDecision.isAllowed);

    // But a resource outside the policy scope is not allowed.
    const deniedDecision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::other-bucket/object.txt",
    });

    assertFalse(deniedDecision.isAllowed);
  });

  it("is idempotent when the same managed policy is attached twice", async () => {
    // Given a Role with a managed policy already attached.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const createPolicyOutput = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadReports",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::reports-bucket/*",
            },
          ],
        }),
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportsReader",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );

    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ReportsReader",
        PolicyArn: createPolicyOutput.Policy.Arn,
      }),
    );

    // When the same managed policy is attached again.
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "ReportsReader",
        PolicyArn: createPolicyOutput.Policy.Arn,
      }),
    );

    // Then the Role still has access exactly once.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports-bucket/daily.json",
    });

    assertTrue(decision.isAllowed);
  });

  it("allows attaching an ARN with no stored managed policy without granting access", async () => {
    // Given a Role and a policy ARN that has no stored managed policy, such as
    // an AWS-managed policy ARN.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "AwsManagedReader",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );

    // When an unknown managed policy ARN is attached.
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: "AwsManagedReader",
        PolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      }),
    );

    // Then the attachment succeeds but contributes no authorization statements.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: createRoleOutput.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::any-bucket/object.txt",
    });

    assertFalse(decision.isAllowed);
  });
});

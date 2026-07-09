import {
  CreateRoleCommand,
  ListPoliciesCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";

describe("IAM PutRolePolicyCommand", () => {
  it("adds an inline identity policy to a role without creating a managed policy", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "ec2.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      }),
    );

    // When an inline policy is added to the Role.
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ApplicationRole",
        PolicyName: "ReadObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          ],
        }),
      }),
    );

    const decision = simIam.authorize({
      principal: createRoleOutput.Role.Arn,
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/object.txt",
    });

    // Then the inline policy grants access.
    assertTrue(decision.isAllowed);
    assertIdentical(decision.value, "Allow");

    // When managed policies are listed.
    const listPoliciesOutput = await simIam.listPolicies(
      new ListPoliciesCommand(),
    );

    // Then the inline policy is not included as a managed policy.
    assertArrayLength(listPoliciesOutput.Policies, 0);
    assertFalse(listPoliciesOutput.IsTruncated);
    assertUndefined(listPoliciesOutput.Marker);
  });

  it("replaces an existing inline role policy with the same name", async () => {
    // Given an IAM Role with an inline policy exists.
    const simAws = new SimAws();

    const simIam = simAws.iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ApplicationRole",
        PolicyName: "ObjectAccess",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          ],
        }),
      }),
    );

    // When another inline policy is put with the same policy name.
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ApplicationRole",
        PolicyName: "ObjectAccess",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          ],
        }),
      }),
    );

    const decision = simIam.authorize({
      principal: createRoleOutput.Role.Arn,
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/object.txt",
    });

    // Then the existing inline policy is replaced.
    assertTrue(decision.isExplicitDeny);
    assertIdentical(decision.value, "ExplicitDeny");
  });
});

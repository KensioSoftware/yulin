import {
  CreateRoleCommand,
  ListPoliciesCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamMalformedPolicyDocument } from "../../../error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

describe("IAM PutRolePolicyCommand", () => {
  it("adds an inline identity policy to a role without creating a managed policy", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
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
      caller: {
        kind: "arn",
        arn: roleCreation.Role.Arn,
      },
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
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
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
      caller: {
        kind: "arn",
        arn: roleCreation.Role.Arn,
      },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/object.txt",
    });

    // Then the existing inline policy is replaced.
    assertTrue(decision.isExplicitDeny);
    assertIdentical(decision.value, "ExplicitDeny");
  });

  it("throws when a policy statement has neither Action nor NotAction", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When an inline policy statement omits Action and NotAction.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "InvalidPolicy",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Resource: "*",
              },
            ],
          }),
        }),
      ),
    );

    // Then the policy document is rejected.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      'Role "ApplicationRole" policy "InvalidPolicy" statement 1: must define either Action or NotAction',
    );
  });

  it("throws when a policy statement has neither Resource nor NotResource", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When an inline policy statement omits Resource and NotResource.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "InvalidPolicy",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "s3:GetObject",
              },
            ],
          }),
        }),
      ),
    );

    // Then the policy document is rejected.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      'Role "ApplicationRole" policy "InvalidPolicy" statement 1: must define either Resource or NotResource',
    );
  });

  it("throws when a policy statement Resource is not a string or a list", async () => {
    // Given an IAM Role exists.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When an inline policy statement holds an unresolved CloudFormation
    // intrinsic where its Resource ARN belongs.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: "ApplicationRole",
          PolicyName: "InvalidPolicy",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "athena:StartQueryExecution",
                Resource: { "Fn::GetAtt": ["DoesNotExist", "Arn"] },
              },
            ],
          }),
        }),
      ),
    );

    // Then the document is rejected at the put, where the Role, the policy and
    // the statement can all be named.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      'Role "ApplicationRole" policy "InvalidPolicy" statement 1: Resource ' +
        "must be a string or an array of strings, but holds " +
        '{"Fn::GetAtt":["DoesNotExist","Arn"]}',
    );
  });
});

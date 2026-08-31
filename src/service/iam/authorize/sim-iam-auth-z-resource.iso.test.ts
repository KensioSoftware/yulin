import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("sim IAM authorization resourced-based", () => {
  it("authorizes from a supplied resource policy", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ResourcePolicyOnlyRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  AWS: roleCreation.Role.Arn,
                },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/*",
              },
            ],
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("does not authorize from a resource policy with a non-matching principal", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "MismatchedResourcePolicyRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  AWS: "arn:aws:iam::123456789012:role/AnotherRole",
                },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/*",
              },
            ],
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayEmpty(decision.allowStatements);
    assertArrayEmpty(decision.explicitDenyStatements);
  });

  it("lets an explicit deny in a resource policy override an identity allow", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ResourcePolicyDenyRole",
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
        RoleName: "ResourcePolicyDenyRole",
        PolicyName: "AllowReads",
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
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/private/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/private/*",
              },
            ],
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isExplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isImplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });

  it("supports NotPrincipal in resource policies", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "NotPrincipalResourcePolicyRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                NotPrincipal: {
                  AWS: "arn:aws:iam::123456789012:role/BlockedRole",
                },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::example-bucket/*",
              },
            ],
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayEmpty(decision.explicitDenyStatements);
  });
});

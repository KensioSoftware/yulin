import {
  CreatePolicyCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("Sim IAM authorization", () => {
  it("explicitly denies the default root when a resource policy denies it", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/private/example-key.txt",
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Deny",
              Principal: "arn:aws:iam::123456789012:root",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/private/*",
            },
          },
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isExplicitDeny);
    assertFalse(decision.isAllowed);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });

  it("implicitly denies an unknown principal", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:role/MissingRole",
      },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("implicitly denies a role with only a trust policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TrustedButNotPermittedRole",
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

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("does not authorize from an unattached managed policy", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnattachedPolicyRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "UnattachedAllowPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::example-bucket/*",
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("uses account-scoped IAM state when authorizing through SimAws account services", async () => {
    const simAws = new SimAws();
    const sourceAccountId = makeSimAwsAccountId();
    const otherAccountId = makeSimAwsAccountId();
    const sourceIam = simAws.account(sourceAccountId).iam();
    const otherIam = simAws.account(otherAccountId).iam();

    const roleCreation = await sourceIam.createRole(
      new CreateRoleCommand({
        RoleName: "AccountScopedRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${sourceAccountId}:root` },
          },
        }),
      }),
    );

    const decision = otherIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("explicit deny from an inline identity policy overrides an inline allow", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineAllowAndDenyRole",
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
        RoleName: "InlineAllowAndDenyRole",
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

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineAllowAndDenyRole",
        PolicyName: "DenySpecificRead",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/private/*",
            },
          ],
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/private/example-key.txt",
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isExplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isImplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });
});

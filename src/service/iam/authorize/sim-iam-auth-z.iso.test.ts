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

describe("Sim IAM authorization", () => {
  it("implicitly denies when no principal is supplied", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: undefined,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("implicitly denies an unknown principal", () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: "arn:aws:iam::123456789012:role/MissingRole",
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

    const createRoleOutput = await simIam.createRole(
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
      principal: createRoleOutput.Role.Arn,
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

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnattachedPolicyRole",
        AssumeRolePolicyDocument: "{}",
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
      principal: createRoleOutput.Role.Arn,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isImplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("does not currently authorize from a supplied resource policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ResourcePolicyOnlyRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: createRoleOutput.Role.Arn,
      resourcePolicies: [
        {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                AWS: createRoleOutput.Role.Arn,
              },
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          ],
        },
      ],
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

    const sourceIam = simAws.account("123456789012").iam();
    const otherIam = simAws.account("210987654321").iam();

    const createRoleOutput = await sourceIam.createRole(
      new CreateRoleCommand({
        RoleName: "AccountScopedRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    const decision = otherIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: createRoleOutput.Role.Arn,
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

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineAllowAndDenyRole",
        AssumeRolePolicyDocument: "{}",
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
      principal: createRoleOutput.Role.Arn,
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

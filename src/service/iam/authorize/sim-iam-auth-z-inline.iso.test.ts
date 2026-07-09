import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";

describe("Sim IAM inline identity policy authorization", () => {
  it("allows a role through an inline identity policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineReaderRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineReaderRole",
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
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: createRoleOutput.Role.Arn,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("implicitly denies when no inline identity policy statement matches", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineReaderRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineReaderRole",
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
      action: "s3:PutObject",
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

  it("allows an inline identity policy statement with a non-matching NotAction", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineNotActionRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineNotActionRole",
        PolicyName: "AllowExceptDeletes",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              NotAction: "s3:DeleteObject",
              Resource: "arn:aws:s3:::example-bucket/*",
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

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("allows an inline identity policy statement with a non-matching NotResource", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineNotResourceRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineNotResourceRole",
        PolicyName: "AllowExceptPrivateObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:GetObject",
              NotResource: "arn:aws:s3:::example-bucket/private/*",
            },
          ],
        }),
      }),
    );

    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/public/example-key.txt",
      principal: createRoleOutput.Role.Arn,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("implicitly denies an inline identity policy statement without resources", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineNoResourceRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineNoResourceRole",
        PolicyName: "AllowWithoutResources",
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
    );

    const error = assertThrowsError(() => {
      simIam.authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::example-bucket/example-key.txt",
        principal: createRoleOutput.Role.Arn,
      });
    });

    assertInstanceOf(error, TypeError);
    assertStringIncludes(
      error.message,
      "IAM policy statement must define either Resource or NotResource",
    );
  });

  it("explicitly denies a role through an inline identity policy", async () => {
    const simAws = new SimAws();

    const simIam = simAws.account("123456789012").iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "InlineDeniedRole",
        AssumeRolePolicyDocument: "{}",
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "InlineDeniedRole",
        PolicyName: "DenyReads",
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
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      principal: createRoleOutput.Role.Arn,
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.isDenied);
    assertTrue(decision.isExplicitDeny);
    assertFalse(decision.isAllowed);
    assertFalse(decision.isImplicitDeny);
    assertArrayLength(decision.allowStatements, 0);
    assertArrayLength(decision.explicitDenyStatements, 1);
  });
});

import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("sim IAM authorization principal", () => {
  it("authorizes from caller context principal", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();

    const simIam = simAws.account(accountId).iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CallerContextRole",
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
      caller: {
        kind: "arn",
        arn: createRoleOutput.Role.Arn,
      },
      resourcePolicies: [
        {
          document: {
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
          policyName: "BucketPolicy",
          resourceArn: "arn:aws:s3:::example-bucket",
        },
      ],
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });

  it("allows caller context principal to resolve identity policies", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();

    const simIam = simAws.account(accountId).iam();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CallerContextIdentityRole",
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
        RoleName: "CallerContextIdentityRole",
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
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "arn",
        arn: createRoleOutput.Role.Arn,
      },
    });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.Allow);
    assertFalse(decision.isDenied);
    assertFalse(decision.isImplicitDeny);
    assertTrue(decision.isAllowed);
    assertFalse(decision.isExplicitDeny);
    assertArrayLength(decision.allowStatements, 1);
    assertArrayLength(decision.explicitDenyStatements, 0);
  });
});

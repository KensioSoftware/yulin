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
import type { SimIamResourcePolicyInput } from "./context/sim-iam-auth-z-input.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:orders";

/**
 * A function resource policy granting one service principal the invoke action.
 */
function servicePolicy(service: string): SimIamResourcePolicyInput {
  return {
    document: {
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: service },
          Action: "lambda:InvokeFunction",
          Resource: functionArn,
        },
      ],
    },
    policyName: "FunctionPolicy",
    resourceArn: functionArn,
  };
}

describe("sim IAM authorization principal", () => {
  it("authorizes from caller context principal", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();

    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
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
        arn: roleCreation.Role.Arn,
      },
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

    const roleCreation = await simIam.createRole(
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
        arn: roleCreation.Role.Arn,
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

  it("allows the service a resource policy names", () => {
    // Given a resource policy granting one AWS service the action
    const simIam = new SimAws().iam();

    // When that service asks for it
    const decision = simIam.authorize({
      action: "lambda:InvokeFunction",
      resource: functionArn,
      caller: { kind: "service", service: "apigateway.amazonaws.com" },
      resourcePolicies: [servicePolicy("apigateway.amazonaws.com")],
    });

    // Then the statement names the caller, which has no Account for it to
    // delegate to
    assertTrue(decision.isAllowed);
  });

  it("does not allow another service, or a principal that is not one", () => {
    // Given the same resource policy
    const simIam = new SimAws().iam();

    // When another service asks, and when an ordinary Role principal does
    const otherService = simIam.authorize({
      action: "lambda:InvokeFunction",
      resource: functionArn,
      caller: { kind: "service", service: "s3.amazonaws.com" },
      resourcePolicies: [servicePolicy("apigateway.amazonaws.com")],
    });
    const role = simIam.authorize({
      action: "lambda:InvokeFunction",
      resource: functionArn,
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::888888888888:role/Caller",
      },
      resourcePolicies: [servicePolicy("apigateway.amazonaws.com")],
    });

    // Then neither is the service the statement names
    assertTrue(otherService.isImplicitDeny);
    assertTrue(role.isImplicitDeny);
  });
});

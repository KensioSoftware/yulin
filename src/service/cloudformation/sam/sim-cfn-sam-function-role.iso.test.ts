import {
  assertArrayLength,
  assertIdentical,
  assertMapSize,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRole } from "../../iam/role/sim-iam-role.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import { simCfnSamFunctionTemplateFactory } from "./function/sim-cfn-sam-function-template.factory.js";

const readRatesTable: SimCfnTemplateValue = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "dynamodb:GetItem",
      Resource: "arn:aws:dynamodb:eu-west-2:111111111111:table/rates",
    },
  ],
};

describe("SAM Serverless Function execution Role", () => {
  it("gives the Role the basic execution policy SAM gives one", async () => {
    // Given a SAM function stating no policies at all
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-basic-role-stack",
      template: simCfnSamFunctionTemplateFactory.make(),
    });

    // Then the Role it was expanded with attaches the basic execution policy,
    // resolved against the partition the Stack deployed into
    const role = stack.getResource("RatesRole")?.simResource as SimIamRole;
    assertNonNullable(role);

    assertTrue(
      role.attachedPolicyArns.has(
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ),
    );

    // And it trusts Lambda to assume it
    assertNonNullable(role.assumeRolePolicyDocument);
    assertStringIncludes(role.assumeRolePolicyDocument, "lambda.amazonaws.com");
  });

  it("puts the policy documents a function states onto its Role", async () => {
    // Given a SAM function stating a policy document of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-policies-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: { Policies: [readRatesTable] },
      }),
    });

    // Then the Role holds it as an inline policy
    const role = stack.getResource("RatesRole")?.simResource as SimIamRole;
    assertNonNullable(role);

    const policyDocument = role.inlinePolicies.get("RatesRolePolicy0");
    assertNonNullable(policyDocument);
    assertStringIncludes(policyDocument, "dynamodb:GetItem");
  });

  it("attaches a managed policy ARN a function states", async () => {
    // Given a SAM function stating one managed policy ARN rather than a list
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-managed-policy-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Policies: "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
        },
      }),
    });

    // Then the Role attaches it
    const role = stack.getResource("RatesRole")?.simResource as SimIamRole;
    assertNonNullable(role);

    assertTrue(
      role.attachedPolicyArns.has(
        "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
      ),
    );
  });

  it("deploys a function whose policies are SAM policy templates", async () => {
    // Given a SAM function asking for a policy template, which is a named set
    // of permissions SAM generates statements from
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-policy-template-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Policies: [{ DynamoDBCrudPolicy: { TableName: "rates" } }],
        },
      }),
    });

    // Then the function and its Role still deploy, with the template left
    // ungenerated. Simulated IAM allows every call by default, and a Role
    // missing those statements authorizes the same calls either way
    const role = stack.getResource("RatesRole")?.simResource as SimIamRole;
    assertNonNullable(role);
    assertMapSize(role.inlinePolicies, 0);
    assertArrayLength(stack.skippedResources, 0);
  });

  it("expands no Role for a function naming the Role it runs as", async () => {
    // Given a SAM function naming an execution Role by ARN
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const roleArn = `arn:aws:iam::${accountId}:role/RatesExecution`;

    // When it is deployed
    const stack = await simAws
      .account(accountId)
      .region("eu-west-2")
      .cloudFormation()
      .deployTemplate({
        stackName: "rates-own-role-stack",
        template: simCfnSamFunctionTemplateFactory.make({
          functionProperties: { Role: roleArn },
        }),
      });

    // Then the function runs as the Role it named, and the Stack holds no Role
    // of its own
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);
    assertIdentical(simFunction.roleArn, roleArn);
    assertUndefined(stack.getResource("RatesRole"));
  });
});

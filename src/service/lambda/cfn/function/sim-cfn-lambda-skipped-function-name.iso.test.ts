import {
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const regionName = "us-east-1";

/**
 * A stack holding a function sim Lambda declines on its Runtime, beside the
 * log group CDK writes for a function: `/aws/lambda/` joined to a Ref of it.
 *
 * Neither Resource is named by the template, so both names come from
 * CloudFormation, which is what makes the Ref worth asserting on.
 */
const skippedFunctionStack = {
  Resources: {
    ReportFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        Role: "arn:aws:iam::111111111111:role/ReportRole",
        Handler: "index.handler",
        Runtime: "python3.13",
        Code: { ZipFile: "def handler(event, context): return 'report'" },
      },
    },
    ReportFunctionLogGroup: {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: {
          "Fn::Join": ["", ["/aws/lambda/", { Ref: "ReportFunction" }]],
        },
      },
    },
  },
};

describe("a Lambda function skipped on its runtime", () => {
  it("answers Ref with the name CloudFormation generates for it", async () => {
    // Given the stack with the Python function and its log group.
    const simAws = new SimAws({ defaultRegionName: regionName });

    // When it is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ReportStack",
      template: skippedFunctionStack,
    });

    // Then the function is skipped, and answers Ref with the name a real
    // deployment would have given it rather than with its logical ID.
    const functionResource = stack.getResource("ReportFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertTypeString(functionResource.refValue);
    assertStringStartsWith(
      functionResource.refValue,
      "ReportStack-ReportFunction-",
    );

    await simAws.backgroundTasksComplete();
  });

  it("names the log group that joins its Ref after the generated name", async () => {
    // Given the same stack.
    const simAws = new SimAws({ defaultRegionName: regionName });

    // When it is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ReportStack",
      template: skippedFunctionStack,
    });

    // Then a log group exists under the name the joined Ref produces, which
    // carries the stack name the way a real deployment's does.
    const logGroupResource = stack.getResource("ReportFunctionLogGroup");

    assertNonNullable(logGroupResource);
    assertIdentical(logGroupResource.status, "CREATE_COMPLETE");

    const [logGroup] = simAws.logs().allLogGroups();

    assertNonNullable(logGroup);
    assertStringStartsWith(
      logGroup.logGroupName,
      "/aws/lambda/ReportStack-ReportFunction-",
    );

    await simAws.backgroundTasksComplete();
  });

  it("deploys as a Role scoped to the stack-name prefixes", async () => {
    // Given a deploy Role allowed Lambda on the functions of this stack and
    // CloudWatch Logs on their log groups, and nothing else, as a shared
    // account tightens a deployment to.
    const simAws = new SimAws({ defaultRegionName: regionName });
    const accountId = simAws.defaultAccountId;
    const deployer = await deployRole(simAws, [
      `arn:aws:lambda:${regionName}:${accountId}:function:ReportStack-*`,
      `arn:aws:logs:${regionName}:${accountId}:log-group:/aws/lambda/ReportStack-*`,
    ]);

    // When the stack is deployed as that Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ReportStack",
      template: skippedFunctionStack,
      caller: deployer,
    });

    // Then the log group was created, because the skipped function's Ref put
    // it under the prefix an account would have allowed it under.
    assertIdentical(
      stack.getResource("ReportFunctionLogGroup")?.status,
      "CREATE_COMPLETE",
    );

    await simAws.backgroundTasksComplete();
  });
});

/**
 * A Role a deployment can run as, allowed everything on the resources it names
 * and nothing anywhere else.
 */
async function deployRole(
  simAws: SimAws,
  resources: readonly string[],
): Promise<SimAwsCaller> {
  const roleName = "DeployRole";
  const iam = simAws.iam();

  await iam.createRole({
    input: {
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: roleName,
      PolicyName: "DeployPolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: ["lambda:*", "logs:*"], Resource: resources },
      }),
    },
  });

  return {
    kind: "arn",
    arn: `arn:aws:iam::${simAws.defaultAccountId}:role/${roleName}`,
  };
}

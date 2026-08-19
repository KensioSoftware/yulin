import { GetPolicyCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { SimLambdaFunctionAlias } from "../../function/version/sim-lambda-function-alias.js";

const callerRoleArn = "arn:aws:iam::222222222222:role/Caller";

const greeterFunction = {
  Type: "AWS::Lambda::Function",
  Properties: {
    FunctionName: "greeter",
    Role: "arn:aws:iam::888888888888:role/GreeterRole",
    Code: { ZipFile: "exports.handler = async () => 'hello';" },
    Handler: "index.handler",
    Runtime: "nodejs22.x",
  },
};

const greeterVersion = {
  Type: "AWS::Lambda::Version",
  Properties: { FunctionName: { Ref: "GreeterFunction" } },
};

function greeterTemplate(
  aliasProperties: Record<string, SimCfnTemplateValue>,
  extraResources: Record<string, unknown> = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      GreeterFunction: greeterFunction,
      GreeterVersion: greeterVersion,
      GreeterAlias: {
        Type: "AWS::Lambda::Alias",
        Properties: aliasProperties,
      },
      ...extraResources,
    },
    Outputs: {
      AliasRef: { Value: { Ref: "GreeterAlias" } },
      AliasArn: { Value: { "Fn::GetAtt": ["GreeterAlias", "AliasArn"] } },
    },
  };
}

const liveAlias = {
  FunctionName: { Ref: "GreeterFunction" },
  Name: "live",
  FunctionVersion: { "Fn::GetAtt": ["GreeterVersion", "Version"] },
};

describe("Lambda CloudFormation Alias deployment", () => {
  it("creates an alias at the version its FunctionVersion names", async () => {
    // Given a template with a function, a published version and an alias
    // pointing at that version, which is what a CDK app synthesizes
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        ...liveAlias,
        Description: "What callers reach",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Resource is backed by a simulated alias at that version
    const alias = stack.getResource("GreeterAlias")?.simResource;
    assertInstanceOf(alias, SimLambdaFunctionAlias);
    assertIdentical(alias.name, "live");
    assertIdentical(alias.functionVersion, "1");
    assertIdentical(alias.configuration().Description, "What callers reach");

    // And an invocation through the alias runs the published version rather
    // than $LATEST
    const invoked = await simAws
      .lambda()
      .invoke(
        new InvokeCommand({ FunctionName: "greeter", Qualifier: "live" }),
      );
    assertIdentical(invoked.ExecutedVersion, "1");

    await simAws.backgroundTasksComplete();
  });

  it("resolves Ref and Fn::GetAtt AliasArn to the alias ARN", async () => {
    // Given a deployed stack with an alias
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate(liveAlias),
    });
    await stack.waitForDeployComplete();

    // When the stack outputs are read
    // Then both name the alias, which is the function ARN with the alias name
    // on the end, so the rest of the template reaches the alias rather than
    // the function
    const aliasArn =
      "arn:aws:lambda:us-east-1:888888888888:function:greeter:live";
    assertIdentical(stack.outputs.get("AliasRef")?.value, aliasArn);
    assertIdentical(stack.outputs.get("AliasArn")?.value, aliasArn);

    await simAws.backgroundTasksComplete();
  });

  it("grants an AWS::Lambda::Permission naming the alias on the alias", async () => {
    // Given a template granting another Account's Role the alias, which is
    // how CDK writes grantInvoke on a lambda.Alias
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate(liveAlias, {
        GreeterAliasPermission: {
          Type: "AWS::Lambda::Permission",
          Properties: {
            FunctionName: { Ref: "GreeterAlias" },
            Action: "lambda:InvokeFunction",
            Principal: callerRoleArn,
          },
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the statement is held against the alias, with the alias ARN as its
    // Resource, rather than against the function the alias points into
    const policy = await simAws
      .lambda()
      .getPolicy(
        new GetPolicyCommand({ FunctionName: "greeter", Qualifier: "live" }),
      );
    const statements = JSON.parse(policy.Policy).Statement;
    assertArrayLength(statements, 1);
    assertObjectEquals(statements[0], {
      Sid: "GreeterAliasPermission",
      Effect: "Allow",
      Principal: { AWS: callerRoleArn },
      Action: "lambda:InvokeFunction",
      Resource: "arn:aws:lambda:us-east-1:888888888888:function:greeter:live",
    });

    // And the function itself was granted nothing, so a call on $LATEST is
    // decided by a policy of its own
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .lambda()
          .getPolicy(new GetPolicyCommand({ FunctionName: "greeter" })),
    );
    assertInstanceOf(error, SimLambdaResourceNotFoundException);

    await simAws.backgroundTasksComplete();
  });

  it("deletes the alias before the function it is on", async () => {
    // Given a deployed stack with an alias
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate(liveAlias),
    });
    await stack.waitForDeployComplete();
    const simFunction = simAws.lambda().getSimFunctionByName("greeter");
    assertNonNullable(simFunction);

    // When the stack is deleted
    await stack.delete();
    await stack.waitForDeleteComplete();

    // Then the alias Resource was deleted, and the function went with the
    // Resource that created it rather than with the alias
    const aliasResource = stack.getResource("GreeterAlias");
    assertNonNullable(aliasResource);
    assertTrue(aliasResource.deleted);
    assertUndefined(simAws.lambda().getSimFunctionByName("greeter"));

    await simAws.backgroundTasksComplete();
  });

  it("fails the Resource when Name is missing", async () => {
    // Given a template whose alias has no name
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "greeter-stack",
        template: greeterTemplate({
          FunctionName: { Ref: "GreeterFunction" },
          FunctionVersion: { "Fn::GetAtt": ["GreeterVersion", "Version"] },
        }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the failure names the Resource type, property and logical ID
    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::Alias GreeterAlias: Name must be a string",
    );
  });
});

import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
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
import { SimLambdaFunction } from "../../function/sim-lambda-function.js";

function greeterTemplate(
  versionProperties: Record<string, SimCfnTemplateValue>,
  outputs: Record<string, { Value: SimCfnTemplateValue }> = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::888888888888:role/GreeterRole",
          Code: { ZipFile: "exports.handler = async () => 'hello';" },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
        },
      },
      GreeterVersion: {
        Type: "AWS::Lambda::Version",
        Properties: versionProperties,
      },
    },
    Outputs: {
      VersionRef: { Value: { Ref: "GreeterVersion" } },
      VersionNumber: { Value: { "Fn::GetAtt": ["GreeterVersion", "Version"] } },
      ...outputs,
    },
  };
}

describe("Lambda CloudFormation Version deployment", () => {
  it("publishes a version from AWS::Lambda::Version", async () => {
    // Given a template with a function and a version published from it
    const simAws = new SimAws();

    // When the template is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({ FunctionName: { Ref: "GreeterFunction" } }),
    });
    await stack.waitForDeployComplete();

    // Then the Resource is backed by the published version, which is the
    // function under a number rather than the function itself
    const version = stack.getResource("GreeterVersion")?.simResource;
    assertInstanceOf(version, SimLambdaFunction);
    assertIdentical(version.version, "1");
    assertIdentical(
      simAws.lambda().getSimFunctionByName("greeter")?.version,
      "$LATEST",
    );

    // And the version answers an invocation asking for it by number
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter", Qualifier: "1" }));
    assertIdentical(invoked.ExecutedVersion, "1");

    await simAws.backgroundTasksComplete();
  });

  it("resolves Ref to the qualified function ARN", async () => {
    // Given a deployed stack with a published version
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate(
        { FunctionName: { "Fn::GetAtt": ["GreeterFunction", "Arn"] } },
        {
          VersionFunctionArn: {
            Value: { "Fn::GetAtt": ["GreeterVersion", "FunctionArn"] },
          },
        },
      ),
    });
    await stack.waitForDeployComplete();

    // When the stack outputs are read
    // Then Ref is the function ARN with the version number on the end, which
    // is what an alias or an integration has to be pointed at to reach this
    // version rather than $LATEST
    assertIdentical(
      stack.outputs.get("VersionRef")?.value,
      "arn:aws:lambda:us-east-1:888888888888:function:greeter:1",
    );

    // And Fn::GetAtt Version is the number itself
    assertIdentical(stack.outputs.get("VersionNumber")?.value, "1");

    // And Fn::GetAtt FunctionArn names the version, as PublishVersion answers
    assertIdentical(
      stack.outputs.get("VersionFunctionArn")?.value,
      "arn:aws:lambda:us-east-1:888888888888:function:greeter:1",
    );

    await simAws.backgroundTasksComplete();
  });

  it("describes the version the template describes", async () => {
    // Given a template describing the version rather than the function
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({
        FunctionName: { Ref: "GreeterFunction" },
        Description: "The greeting that went out on Tuesday",
      }),
    });
    await stack.waitForDeployComplete();

    // Then the published version carries that description, and the function it
    // was published from keeps its own
    const version = stack.getResource("GreeterVersion")?.simResource;
    assertInstanceOf(version, SimLambdaFunction);
    assertIdentical(
      version.description,
      "The greeting that went out on Tuesday",
    );
    assertUndefined(
      simAws.lambda().getSimFunctionByName("greeter")?.description,
    );

    await simAws.backgroundTasksComplete();
  });

  it("leaves the version alone when the Stack is deleted", async () => {
    // Given a deployed stack with a published version
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: greeterTemplate({ FunctionName: { Ref: "GreeterFunction" } }),
    });
    await stack.waitForDeployComplete();

    // When the stack is deleted
    await stack.delete();
    await stack.waitForDeleteComplete();

    // Then the Version Resource tears down without a delete of its own, since
    // Lambda has no operation that deletes one version, and the function it
    // was published from takes it away as it goes
    const version = stack.getResource("GreeterVersion");
    assertNonNullable(version);
    assertTrue(version.deleteComplete);
    assertUndefined(simAws.lambda().getSimFunctionByName("greeter"));

    await simAws.backgroundTasksComplete();
  });

  it("fails the Resource when FunctionName is missing", async () => {
    // Given a template whose version names no function
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "greeter-stack",
        template: greeterTemplate({ Description: "Nothing in particular" }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the failure names the Resource type, property and logical ID
    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::Version GreeterVersion: FunctionName must be a string",
    );
  });
});

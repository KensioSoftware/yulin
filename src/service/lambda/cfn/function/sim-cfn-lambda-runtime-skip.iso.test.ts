import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const pythonFunctionTemplate = {
  Resources: {
    ReportFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "report",
        Role: "arn:aws:iam::111111111111:role/ReportRole",
        Handler: "index.handler",
        Runtime: "python3.13",
        Code: { ZipFile: "def handler(event, context): return 'report'" },
      },
    },
  },
};

describe("Lambda CloudFormation Function runtime support", () => {
  it("skips a function declaring a runtime sim Lambda does not simulate", async () => {
    // Given a template with a Python function, as CDK synthesizes for its
    // BucketDeployment provider.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "report-stack",
      template: pythonFunctionTemplate,
    });

    // Then the Resource is skipped rather than failing the stack, saying why.
    const functionResource = stack.getResource("ReportFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(functionResource.skippedReason, "python3.13");
    assertStringIncludes(functionResource.skippedReason, "Node.js");

    // And no simulated function is created for it.
    assertUndefined(simAws.lambda().getSimFunctionByName("report"));

    await simAws.backgroundTasksComplete();
  });

  it("deploys a function with an unsimulated runtime when a handler is bound", async () => {
    // Given the same Python function, with a real in-process handler bound to
    // it, which replaces the template code wholesale.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "report-stack",
      template: pythonFunctionTemplate,
      bindings: [
        {
          functionName: "report",
          handler: (): { source: string } => ({ source: "bound-handler" }),
        },
      ],
    });

    // Then the Resource deploys, because the bound handler is what runs.
    const functionResource = stack.getResource("ReportFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);

    const invokeOutput = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "report" }));

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    assertStringIncludes(
      Buffer.from(invokeOutput.Payload).toString(),
      "bound-handler",
    );

    await simAws.backgroundTasksComplete();
  });

  it("deploys a function that declares no runtime", async () => {
    // Given a template function with inline code and no Runtime property, as
    // a minimal hand-written template has.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: {
        Resources: {
          GreeterFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "greeter",
              Role: "arn:aws:iam::111111111111:role/GreeterRole",
              Handler: "index.handler",
              Code: { ZipFile: "exports.handler = async () => 'hello';" },
            },
          },
        },
      },
    });

    // Then it deploys, as the runtime gate only declines a declared runtime.
    const functionResource = stack.getResource("GreeterFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);
    assertNonNullable(simAws.lambda().getSimFunctionByName("greeter"));

    await simAws.backgroundTasksComplete();
  });
});

/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import { CreateStackCommand } from "@aws-sdk/client-cloudformation";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("CloudFormation CreateStackCommand with a YAML TemplateBody", () => {
  it("creates the Resources a YAML template describes", async () => {
    // Given a template body written as YAML, calling an intrinsic by the
    // short-form tag a hand-written template uses.
    const templateBody = [
      "Resources:",
      "  WorkQueue:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      '      QueueName: !Sub "${AWS::StackName}-work"',
      "Outputs:",
      "  QueueArn:",
      "    Value: !GetAtt WorkQueue.Arn",
    ].join("\n");

    // When the Stack is created from it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "work-stack",
        TemplateBody: templateBody,
      }),
    );
    await cloudFormation.waitForStackDeployComplete("work-stack");
    const stack = cloudFormation.getStackByName("work-stack");
    assertNonNullable(stack);

    // Then the Queue is there under the name the tag resolved to, and the
    // Output holds its ARN.
    assertNonNullable(simAws.sqs().findQueue("work-stack-work"));
    assertStringIncludes(
      stack.outputs.get("QueueArn")?.value ?? "",
      "work-stack-work",
    );
  });

  it("expands a SAM template supplied as a YAML body", async () => {
    // Given a SAM template written as YAML, with its function source inline.
    const templateBody = [
      "Transform: AWS::Serverless-2016-10-31",
      "Resources:",
      "  Rates:",
      "    Type: AWS::Serverless::Function",
      "    Properties:",
      "      FunctionName: rates",
      "      Handler: index.handler",
      "      Runtime: nodejs22.x",
      "      InlineCode: \"exports.handler = async () => 'from SAM YAML';\"",
    ].join("\n");

    // When the Stack is created from it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "rates-stack",
        TemplateBody: templateBody,
      }),
    );
    await cloudFormation.waitForStackDeployComplete("rates-stack");
    const stack = cloudFormation.getStackByName("rates-stack");
    assertNonNullable(stack);

    // Then the SAM function was expanded into a Lambda function that runs,
    // the way it is when the same template arrives as JSON.
    assertIdentical(stack.getResource("Rates")?.type, "AWS::Lambda::Function");
    assertArrayEmpty(stack.skippedResources);

    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "rates" }));

    assertNonNullable(output.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(output.Payload).toString()),
      "from SAM YAML",
    );
  });

  it("refuses a body that parses as neither format", async () => {
    // Given a body no parser can make a template of.
    const simAws = new SimAws();

    // When a Stack is created from it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().createStack(
        new CreateStackCommand({
          StackName: "broken-stack",
          TemplateBody: "Resources: [ unclosed",
        }),
      );
    });

    // Then the Stack is named, along with what each format made of the body.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Stack broken-stack TemplateBody must be valid JSON or YAML",
    );
    assertStringIncludes(error.message, "as JSON,");
    assertStringIncludes(error.message, "as YAML,");
  });
});

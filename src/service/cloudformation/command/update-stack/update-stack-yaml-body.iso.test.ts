/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";

const deployedYaml = [
  "Resources:",
  "  WorkQueue:",
  "    Type: AWS::SQS::Queue",
  "    Properties:",
  '      QueueName: !Sub "${AWS::StackName}-work"',
].join("\n");

const deployedJson = jsonStringify({
  Resources: {
    WorkQueue: {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: { "Fn::Sub": "${AWS::StackName}-work" } },
    },
  },
});

/**
 * The same Stack with a second Queue added, written as YAML.
 */
const updatedYaml = [
  deployedYaml,
  "  ReviewQueue:",
  "    Type: AWS::SQS::Queue",
  "    Properties:",
  '      QueueName: !Sub "${AWS::StackName}-review"',
].join("\n");

async function deployWorkStack(
  simAws: SimAws,
  templateBody: string,
): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.createStack(
    new CreateStackCommand({
      StackName: "work-stack",
      TemplateBody: templateBody,
    }),
  );
  await cloudFormation.waitForStackDeployComplete("work-stack");
}

async function updateWorkStack(
  simAws: SimAws,
  templateBody: string,
): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.updateStack(
    new UpdateStackCommand({
      StackName: "work-stack",
      TemplateBody: templateBody,
    }),
  );
  await cloudFormation.waitForStackUpdateComplete("work-stack");
}

describe("CloudFormation UpdateStackCommand with a YAML TemplateBody", () => {
  it("updates a Stack deployed from a JSON body", async () => {
    // Given a Stack deployed from a JSON template body.
    const simAws = new SimAws();
    await deployWorkStack(simAws, deployedJson);
    assertUndefined(simAws.sqs().findQueue("work-stack-review"));

    // When the same infrastructure is updated with a YAML body adding a Queue.
    await updateWorkStack(simAws, updatedYaml);

    // Then the Queue the YAML body added is there, alongside the one the JSON
    // body deployed.
    assertNonNullable(simAws.sqs().findQueue("work-stack-work"));
    assertNonNullable(simAws.sqs().findQueue("work-stack-review"));
  });

  it("updates a Stack deployed from a YAML body", async () => {
    // Given a Stack deployed from a YAML template body.
    const simAws = new SimAws();
    await deployWorkStack(simAws, deployedYaml);

    // When it is updated with a YAML body adding a Queue.
    await updateWorkStack(simAws, updatedYaml);

    // Then both Queues are there.
    assertNonNullable(simAws.sqs().findQueue("work-stack-work"));
    assertNonNullable(simAws.sqs().findQueue("work-stack-review"));
  });

  it("leaves the Stack alone when the body parses as neither format", async () => {
    // Given a Stack deployed from a YAML template body.
    const simAws = new SimAws();
    await deployWorkStack(simAws, deployedYaml);

    // When it is updated with a body no parser can make a template of.
    const error = await assertThrowsErrorAsync(async () => {
      await updateWorkStack(simAws, "Resources: [ unclosed");
    });

    // Then the Stack is named, along with what each format made of the body,
    // and the Stack still holds what it was deployed with.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Stack work-stack TemplateBody must be valid JSON or YAML",
    );
    assertStringIncludes(error.message, "as JSON,");
    assertStringIncludes(error.message, "as YAML,");
    assertNonNullable(simAws.sqs().findQueue("work-stack-work"));
  });
});

/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

const yamlTemplate = [
  "Resources:",
  "  WorkQueue:",
  "    Type: AWS::SQS::Queue",
  "    Properties:",
  '      QueueName: !Sub "${AWS::StackName}-work"',
  "Outputs:",
  "  QueueArn:",
  "    Value: !GetAtt WorkQueue.Arn",
].join("\n");

const jsonTemplate = {
  Resources: {
    WorkQueue: {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: { "Fn::Sub": "${AWS::StackName}-work" },
      },
    },
  },
  Outputs: {
    QueueArn: { Value: { "Fn::GetAtt": ["WorkQueue", "Arn"] } },
  },
};

describe("deploying a template file written as YAML", () => {
  it("creates the Resources the template describes", async () => {
    // Given a hand-written YAML template file.
    const directory = new TemporaryDirectory();
    await directory.writeFile("WorkStack.yaml", yamlTemplate);

    // When it is deployed.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(directory.join("WorkStack.yaml"));

    // Then the Queue is there under the name the intrinsic resolved to, in a
    // Stack named for the template file.
    assertIdentical(stack.stackName, "WorkStack");
    assertNonNullable(simAws.sqs().findQueue("WorkStack-work"));
  });

  it("resolves a short-form tag the way the same template resolves its long form", async () => {
    // Given the same infrastructure written twice, once with short-form tags
    // in YAML and once with the long forms in JSON.
    const directory = new TemporaryDirectory();
    await directory.writeFile("WorkStack.yaml", yamlTemplate);
    await directory.writeFile(
      "WorkStack.template.json",
      jsonStringify(jsonTemplate),
    );

    // When each of them is deployed.
    const fromYaml = await new SimAws()
      .cloudFormation()
      .deployTemplateFile(directory.join("WorkStack.yaml"));
    const fromJson = await new SimAws()
      .cloudFormation()
      .deployTemplateFile(directory.join("WorkStack.template.json"));

    // Then the Output resolved from the tag holds what the long form resolved
    // to, down to the ARN of the Queue the Stack created.
    const arn = fromYaml.outputs.get("QueueArn")?.value;
    assertNonNullable(arn);
    assertIdentical(arn, fromJson.outputs.get("QueueArn")?.value);
  });
});

/**
 * Creating a simulated CloudFormation Stack from a YAML TemplateBody.
 */

import { CreateStackCommand } from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "work-stack",
    TemplateBody: [
      "Resources:",
      "  WorkQueue:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      "      QueueName: work-queue",
      "Outputs:",
      "  QueueArn:",
      "    Value: !GetAtt WorkQueue.Arn",
    ].join("\n"),
  }),
);

await simCfn.waitForStackDeployComplete("work-stack");

const stack = simCfn.getStackByName("work-stack");

console.log(stack?.outputs.get("QueueArn")?.value);

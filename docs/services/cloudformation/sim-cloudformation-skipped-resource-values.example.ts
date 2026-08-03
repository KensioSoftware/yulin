/**
 * The stand-in values a skipped CloudFormation Resource answers with.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stand-in-stack",
  template: {
    Resources: {
      AlarmTopic: {
        Type: "AWS::SNS::Topic",
      },
    },
    Outputs: {
      TopicRef: { Value: { Ref: "AlarmTopic" } },
      TopicArn: { Value: { "Fn::GetAtt": ["AlarmTopic", "TopicArn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("TopicRef")?.value);
// "AlarmTopic"

console.log(stack.outputs.get("TopicArn")?.value);
// "AlarmTopic.TopicArn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "AlarmTopic Unsupported sim CloudFormation Resource service SNS"
}

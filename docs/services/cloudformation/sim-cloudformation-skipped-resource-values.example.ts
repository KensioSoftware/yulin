/**
 * The stand-in values a skipped CloudFormation Resource answers with.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stand-in-stack",
  template: {
    Resources: {
      AlarmRule: {
        Type: "AWS::CloudWatch::Alarm",
      },
    },
    Outputs: {
      AlarmRef: { Value: { Ref: "AlarmRule" } },
      AlarmArn: { Value: { "Fn::GetAtt": ["AlarmRule", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("AlarmRef")?.value);
// "AlarmRule"

console.log(stack.outputs.get("AlarmArn")?.value);
// "AlarmRule.Arn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "AlarmRule Unsupported sim CloudFormation Resource service CloudWatch"
}

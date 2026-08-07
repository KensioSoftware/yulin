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
        Type: "AWS::Events::Rule",
      },
    },
    Outputs: {
      RuleRef: { Value: { Ref: "AlarmRule" } },
      RuleArn: { Value: { "Fn::GetAtt": ["AlarmRule", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("RuleRef")?.value);
// "AlarmRule"

console.log(stack.outputs.get("RuleArn")?.value);
// "AlarmRule.Arn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "AlarmRule Unsupported sim CloudFormation Resource service Events"
}

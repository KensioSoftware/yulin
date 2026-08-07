/**
 * Telling a Resource a Stack is missing from one it left out on purpose.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "inert-stack",
  template: {
    Resources: {
      AwsCliLayer: {
        Type: "AWS::Lambda::LayerVersion",
        Properties: {
          Description: "/opt/awscli/aws",
        },
      },
      AlarmRule: {
        Type: "AWS::Events::Rule",
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["AlarmRule"]

console.log(stack.inertResources.map((resource) => resource.logicalId));
// ["AwsCliLayer"]

console.log(stack.getResource("AwsCliLayer")?.inertReason);
// "sim Lambda runs a function's own code archive, or a real in-process handler
//  bound to it, so nothing a Layer carries is ever on a simulated function's
//  module path"

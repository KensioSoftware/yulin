/**
 * Waiting via the returned simulated CloudFormation Stack object.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stack-object-wait",
  template: {
    Resources: {
      WaitHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await stack.waitForDeployComplete();

/**
 * Waiting for a simulated CloudFormation deployment to finish.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "async-stack",
  template: {
    Resources: {
      WaitHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await simAws.cloudFormation().waitForStackDeployComplete("async-stack");

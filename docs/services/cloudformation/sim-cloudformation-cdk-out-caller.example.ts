/**
 * A caller for the whole cloud assembly, and one for a single Stack.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultRegionName: "eu-west-2",
});

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  caller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/cdk-deploy-role",
  },
  stackOptions: {
    PipelineStack: {
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:role/pipeline-deploy-role",
      },
    },
  },
});

console.log(stacks.get("PipelineStack")?.stackName);

/**
 * Creating a simulated CloudFormation Stack with CreateStackCommand.
 */

import {
  CreateStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "command-stack",
    TemplateBody: JSON.stringify({
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "command-stack-bucket",
          },
        },
      },
    }),
  }),
);

await simCfn.waitForStackDeployComplete("command-stack");

const describeOutput = await simCfn.describeStacks(
  new DescribeStacksCommand({
    StackName: "command-stack",
  }),
);

console.log(describeOutput.Stacks?.[0]?.StackStatus);

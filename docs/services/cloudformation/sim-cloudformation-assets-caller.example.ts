/**
 * Publishing a Stack's CDK file assets as the file publishing Role.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultRegionName: "eu-west-2",
});

const publisher = await simAws.iam().makeDeployRole({
  roleName: "cdk-file-publishing",
  policyDocument: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: ["s3:GetObject*", "s3:GetBucket*", "s3:List*", "s3:PutObject"],
      Resource: "arn:aws:s3:::cdk-hnb659fds-assets-*",
    },
  },
});

const executor = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
  },
});

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  caller: executor,
  assetsCaller: publisher,
});

console.log(stacks.size);

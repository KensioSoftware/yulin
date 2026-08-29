/**
 * Deploying a cloud assembly as a Role made from a policy document.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultRegionName: "eu-west-2",
});

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
  },
});

const stacks = await simAws
  .cloudFormation()
  .deployCdkOut({ directoryPath: "cdk.out", caller: deployer });

console.log(stacks.size);

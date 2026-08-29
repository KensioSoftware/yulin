/**
 * Making a deploy Role from a policy document a project already holds.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: ["s3:*", "kms:*"],
      Resource: "*",
    },
  },
});

console.log(deployer.arn); // "arn:aws:iam::123456789012:role/cdk-exec"

await simAws
  .cloudFormation()
  .deployCdkOut({ directoryPath: "cdk.out", caller: deployer });

/**
 * A deploy Role from a policy split across two documents.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const deployer = await simAws.iam().makeDeployRole({
  roleName: "cdk-exec",
  policyDocument: [
    JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
    {
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "kms:*", Resource: "*" },
    },
  ],
});

console.log(deployer.kind); // "arn"

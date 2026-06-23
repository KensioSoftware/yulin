/**
 * Observing simulated CloudFormation deployment failures.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "failure-stack",
  template: {
    Resources: {
      InvalidBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "Invalid_Bucket_Name",
        },
      },
    },
  },
});

try {
  await stack.waitForDeployComplete();
} catch (error) {
  console.error("Stack deployment failed", error);
}

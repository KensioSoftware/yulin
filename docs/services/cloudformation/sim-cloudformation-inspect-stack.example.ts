/**
 * Inspecting resources created by a simulated CloudFormation Stack.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "inspect-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "inspect-site-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucketResource = stack.getResource("SiteBucket");

console.log(bucketResource?.simResource);

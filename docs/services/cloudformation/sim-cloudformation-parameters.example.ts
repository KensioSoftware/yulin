/**
 * Supplying simulated CloudFormation Parameters.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "parameter-stack",
  template: {
    Parameters: {
      BucketName: {
        Type: "String",
        Default: "default-parameter-bucket",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            Ref: "BucketName",
          },
        },
      },
    },
  },
  parameters: {
    BucketName: "configured-parameter-bucket",
  },
});

await stack.waitForDeployComplete();

console.log(
  simAws.s3().getSimBucketByName("configured-parameter-bucket")?.bucketName,
);

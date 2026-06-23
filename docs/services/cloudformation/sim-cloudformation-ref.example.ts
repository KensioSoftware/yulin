/**
 * Using Ref between simulated CFN resources.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "ref-stack",
  template: {
    Resources: {
      SourceBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "source-ref-bucket",
        },
      },
      WebsiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": ["-", [{ Ref: "SourceBucket" }, "website"]],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(
  simAws.s3().getSimBucketByName("source-ref-bucket-website")?.bucketName,
);

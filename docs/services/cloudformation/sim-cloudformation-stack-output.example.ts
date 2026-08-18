/**
 * Reading a resolved Stack Output as a string.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "output-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "output-site-bucket",
        },
      },
    },
    Outputs: {
      SiteBucketName: {
        Description: "The bucket the site is served from",
        Value: {
          Ref: "SiteBucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucketName = stack.output("SiteBucketName");

console.log(bucketName); // "output-site-bucket"

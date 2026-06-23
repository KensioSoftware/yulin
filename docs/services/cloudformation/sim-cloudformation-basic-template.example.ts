/**
 * Deploying a simple CloudFormation template into simulated AWS.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const stack = await simCfn.deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "example-site-bucket",
          WebsiteConfiguration: {
            IndexDocument: "index.html",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucket = simAws.s3().getSimBucketByName("example-site-bucket");
console.log(bucket?.bucketName);

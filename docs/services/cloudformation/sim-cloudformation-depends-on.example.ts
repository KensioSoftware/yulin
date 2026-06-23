/**
 * Explicit resource dependencies in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "depends-on-stack",
  template: {
    Resources: {
      SourceBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "dependency-source-bucket",
        },
      },
      DependentBucket: {
        Type: "AWS::S3::Bucket",
        DependsOn: "SourceBucket",
        Properties: {
          BucketName: "dependency-target-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

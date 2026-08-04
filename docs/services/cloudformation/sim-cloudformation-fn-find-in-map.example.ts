/**
 * Reading a value from template Mappings in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "find-in-map-stack",
  template: {
    Parameters: {
      Environment: {
        Type: "String",
        Default: "staging",
      },
    },
    Mappings: {
      EnvironmentMap: {
        staging: { BucketName: "staging-site-bucket" },
        production: { BucketName: "production-site-bucket" },
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::FindInMap": [
              "EnvironmentMap",
              { Ref: "Environment" },
              "BucketName",
            ],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("staging-site-bucket")?.bucketName);

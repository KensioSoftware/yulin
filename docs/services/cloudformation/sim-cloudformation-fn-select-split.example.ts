/**
 * Naming a bucket after part of another bucket's domain name.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "select-split-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      LogsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": [
              "-",
              [
                {
                  "Fn::Select": [
                    0,
                    {
                      "Fn::Split": [
                        ".",
                        { "Fn::GetAtt": ["SiteBucket", "DomainName"] },
                      ],
                    },
                  ],
                },
                "logs",
              ],
            ],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// site-bucket-logs, from the first part of site-bucket.s3.amazonaws.com
console.log(simAws.s3().getSimBucketByName("site-bucket-logs")?.bucketName);

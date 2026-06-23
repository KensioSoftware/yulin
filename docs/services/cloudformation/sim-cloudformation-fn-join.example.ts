/**
 * Joining literal values and Refs in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "join-stack",
  template: {
    Parameters: {
      BucketPrefix: {
        Type: "String",
        Default: "joined",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": ["-", [{ Ref: "BucketPrefix" }, "site", "bucket"]],
          },
        },
      },
    },
  },
});

/**
 * Substituting parameter and resource values in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "sub-stack",
  template: {
    Parameters: {
      SiteName: {
        Type: "String",
        Default: "docs",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            // eslint-disable-next-line no-template-curly-in-string
            "Fn::Sub": "${SiteName}-site-bucket",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("docs-site-bucket")?.bucketName);

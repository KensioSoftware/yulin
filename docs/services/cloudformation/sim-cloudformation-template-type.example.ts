/**
 * Naming the type of a template a test builds somewhere other than the call.
 */

import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

function siteTemplate(bucketName: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName,
        },
      },
    },
  };
}

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "typed-site-stack",
  template: siteTemplate("typed-site-bucket"),
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("typed-site-bucket")?.bucketName);

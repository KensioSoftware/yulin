/**
 * Finding out which Resources a simulated CloudFormation Stack skipped.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "skipped-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "skipped-site-bucket",
        },
      },
      SearchApi: {
        Type: "AWS::AppSync::GraphQLApi",
        Properties: {
          Name: "search",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["SearchApi"]

console.log(stack.getResource("SearchApi")?.skippedReason);
// "Unsupported sim CloudFormation Resource service AppSync"

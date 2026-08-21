/**
 * Counting the Resources of one type in a deployed Stack.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "list-resources-stack",
  template: {
    Resources: {
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "list-resources-uploads" },
      },
      ArchiveBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "list-resources-archive" },
      },
      UploadsTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "list-resources-uploads" },
      },
    },
  },
});

await stack.waitForDeployComplete();

const buckets = stack.resources.filter(
  (resource) => resource.type === "AWS::S3::Bucket",
);

console.log(buckets.map((bucket) => bucket.logicalId));
// ["UploadsBucket", "ArchiveBucket"]

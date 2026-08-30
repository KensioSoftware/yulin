/**
 * Bounding a reader's history at ninety days of noncurrent versions.
 */

import {
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reader-history" },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simS3.putBucketVersioning(
  new PutBucketVersioningCommand({
    Bucket: "reader-history",
    VersioningConfiguration: { Status: "Enabled" },
  }),
);

await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "reader-history",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "bound-history",
          Status: "Enabled",
          Filter: { Prefix: "snapshots/" },
          NoncurrentVersionExpiration: { NoncurrentDays: 90 },
        },
      ],
    },
  }),
);

const snapshot = {
  Bucket: "reader-history",
  Key: "snapshots/reader-1.json",
};

await simS3.putObject(new PutObjectCommand({ ...snapshot, Body: "before" }));
await simS3.putObject(new PutObjectCommand({ ...snapshot, Body: "after" }));

await simAws.clock().advanceBy({ days: 91 });

const listed = await simS3.listObjectVersions(
  new ListObjectVersionsCommand({ Bucket: "reader-history" }),
);

// The version the second write displaced has gone, and the current one stays
// however old it is.
console.log(listed.Versions?.length); // 1

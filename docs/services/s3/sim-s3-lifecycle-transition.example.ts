/**
 * Moving simulated S3 Objects between storage classes on a lifecycle rule.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "logs",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "cool-then-freeze",
          Status: "Enabled",
          Filter: { Prefix: "raw/" },
          Transitions: [
            { Days: 30, StorageClass: "STANDARD_IA" },
            { Days: 90, StorageClass: "GLACIER" },
          ],
        },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "logs",
    Key: "raw/2026-08-24.gz",
    Body: "one raw log line",
  }),
);

await simAws.clock().advanceBy({ days: 90 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "logs", Prefix: "raw/" }),
);

// GLACIER, the last transition the clock reached.
console.log(listing.Contents?.[0]?.StorageClass);

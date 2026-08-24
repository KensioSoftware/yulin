/**
 * Expiring simulated S3 Objects against a lifecycle rule.
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
          ID: "expire-raw-logs",
          Status: "Enabled",
          Filter: { Prefix: "raw/" },
          Expiration: { Days: 365 },
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

await simAws.clock().advanceBy({ days: 366 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "logs", Prefix: "raw/" }),
);

// The rule expired the Object, so the listing is empty.
console.log(listing.Contents ?? []);

/**
 * Expiring the simulated S3 Objects a tag selects.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "reports" }));

await simS3.putBucketLifecycleConfiguration(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: "reports",
    LifecycleConfiguration: {
      Rules: [
        {
          ID: "expire-temporary",
          Status: "Enabled",
          Filter: { Tag: { Key: "lifecycle", Value: "temporary" } },
          Expiration: { Days: 7 },
        },
      ],
    },
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reports",
    Key: "draft.csv",
    Body: "period,total",
    Tagging: "lifecycle=temporary",
  }),
);
await simS3.putObject(
  new PutObjectCommand({ Bucket: "reports", Key: "final.csv", Body: "a,b" }),
);

await simAws.clock().advanceBy({ days: 8 });

const listing = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "reports" }),
);

// Only final.csv. The tagged draft is past its expiry.
console.log(listing.Contents?.map((entry) => entry.Key));

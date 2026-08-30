/**
 * A reader's history in a Bucket nothing in the account can delete from.
 */

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

// Versioning goes on underneath Object Lock. Every version written into this
// Bucket is then retained for seven days from the write.
const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "reader-history",
          VersioningConfiguration: { Status: "Enabled" },
          ObjectLockEnabled: true,
          ObjectLockConfiguration: {
            ObjectLockEnabled: "Enabled",
            Rule: { DefaultRetention: { Mode: "COMPLIANCE", Days: 7 } },
          },
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

const written = await simS3.putObject(
  new PutObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    Body: JSON.stringify({ words: ["好"] }),
  }),
);

const held = await simS3.headObject(
  new HeadObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    VersionId: written.VersionId,
  }),
);

console.log(held.ObjectLockMode); // "COMPLIANCE"

try {
  await simS3.deleteObject(
    new DeleteObjectCommand({
      Bucket: "reader-history",
      Key: "events/reader-1.json",
      VersionId: written.VersionId,
      BypassGovernanceRetention: true,
    }),
  );
} catch (error) {
  // AccessDenied. A compliance period gives way to nobody, and naming the
  // bypass changes nothing.
  console.log((error as Error).name);
}

// The period lapses because simulated time passed it.
await simAws.clock().advanceBy({ days: 8 });

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "reader-history",
    Key: "events/reader-1.json",
    VersionId: written.VersionId,
  }),
);

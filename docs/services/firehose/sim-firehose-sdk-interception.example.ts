/**
 * Application code sending to its own FirehoseClient, answered by the
 * simulation.
 */

import {
  CreateDeliveryStreamCommand,
  FirehoseClient,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import type { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

/**
 * A Bucket, a delivery Role allowed the S3 actions given, and a delivery
 * stream writing into the one as the other.
 */
async function makeOrderArchive(
  simAws: SimAws,
  actions: readonly string[] = ["s3:PutObject"],
): Promise<void> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const { Role } = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderArchiveRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "firehose.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderArchiveRole",
      PolicyName: "ArchiveOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: actions,
          Resource: "arn:aws:s3:::order-archive/*",
        },
      }),
    }),
  );

  await simAws.firehose().createDeliveryStream(
    new CreateDeliveryStreamCommand({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: {
        BucketARN: "arn:aws:s3:::order-archive",
        RoleARN: Role.Arn,
        BufferingHints: { IntervalInSeconds: 60 },
      },
    }),
  );
}

using simSdk = new SimSdk();

simSdk.intercept(FirehoseClient);
simSdk.intercept(S3Client);

await makeOrderArchive(simSdk.simAws);

const firehose = new FirehoseClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });

await firehose.send(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode("one\n") },
  }),
);

await simSdk.simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await s3.send(
  new ListObjectsV2Command({ Bucket: "order-archive" }),
);

// 1
console.log(Contents?.length);

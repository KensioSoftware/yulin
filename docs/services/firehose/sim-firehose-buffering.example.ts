/**
 * Three records inside one buffering window, and the single Object they land
 * in.
 */

import { text } from "node:stream/consumers";

import {
  CreateDeliveryStreamCommand,
  PutRecordBatchCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "@kensio/yulin";

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

const simAws = new SimAws();

await makeOrderArchive(simAws);

await simAws.firehose().putRecordBatch(
  new PutRecordBatchCommand({
    DeliveryStreamName: "order-events",
    Records: ["order-1", "order-2", "order-3"].map((id) => ({
      Data: new TextEncoder().encode(`${JSON.stringify({ id })}\n`),
    })),
  }),
);

await simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 1
console.log(Contents?.length);

const object = await simAws.s3().getObject(
  new GetObjectCommand({
    Bucket: "order-archive",
    Key: Contents?.[0]?.Key,
  }),
);

assertNonNullable(object.Body, "The delivered Object has a body");

// {"id":"order-1"}
// {"id":"order-2"}
// {"id":"order-3"}
console.log(await text(object.Body));

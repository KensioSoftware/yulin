/**
 * Putting an order event on a delivery stream and finding it in the Bucket.
 */

import {
  CreateDeliveryStreamCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

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
        Action: "s3:PutObject",
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

const orderEvent = `${JSON.stringify({ id: "order-1" })}\n`;

await simAws.firehose().putRecord(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode(orderEvent) },
  }),
);

await simAws.clock().advanceBy({ seconds: 61 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 2026/08/22/13/order-events-1-2026-08-22-13-51-01-92076704-cf4a-...
console.log(Contents?.[0]?.Key);

/**
 * An order event put on a Kinesis stream, and the Object the delivery stream
 * reading that stream wrote it into.
 */

import { CreateDeliveryStreamCommand } from "@aws-sdk/client-firehose";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateStreamCommand,
  DescribeStreamSummaryCommand,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .s3()
  .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

await simAws
  .kinesis()
  .createStream(
    new CreateStreamCommand({ StreamName: "orders", ShardCount: 2 }),
  );

const { StreamDescriptionSummary } = await simAws
  .kinesis()
  .describeStreamSummary(
    new DescribeStreamSummaryCommand({ StreamName: "orders" }),
  );

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
      Statement: [
        {
          Effect: "Allow",
          Action: "s3:PutObject",
          Resource: "arn:aws:s3:::order-archive/*",
        },
        {
          Effect: "Allow",
          Action: [
            "kinesis:DescribeStream",
            "kinesis:GetShardIterator",
            "kinesis:GetRecords",
          ],
          Resource: StreamDescriptionSummary.StreamARN,
        },
      ],
    }),
  }),
);

await simAws.firehose().createDeliveryStream(
  new CreateDeliveryStreamCommand({
    DeliveryStreamName: "order-events",
    DeliveryStreamType: "KinesisStreamAsSource",
    KinesisStreamSourceConfiguration: {
      KinesisStreamARN: StreamDescriptionSummary.StreamARN,
      RoleARN: Role.Arn,
    },
    ExtendedS3DestinationConfiguration: {
      BucketARN: "arn:aws:s3:::order-archive",
      RoleARN: Role.Arn,
      BufferingHints: { IntervalInSeconds: 60 },
    },
  }),
);

const orderEvent = `${JSON.stringify({ id: "order-1" })}\n`;

await simAws.kinesis().putRecord(
  new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "order-1",
    Data: new TextEncoder().encode(orderEvent),
  }),
);

await simAws.clock().advanceBy({ seconds: 60 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// 1
console.log(Contents?.length);

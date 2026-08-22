/**
 * Deploying a delivery stream from a template and putting a record onto it.
 */

import { PutRecordCommand } from "@aws-sdk/client-firehose";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrderArchive: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "order-archive" },
      },
      DeliveryRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "firehose.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ArchiveOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:PutObject",
                    Resource: "arn:aws:s3:::order-archive/*",
                  },
                ],
              },
            },
          ],
        },
      },
      OrderEvents: {
        Type: "AWS::KinesisFirehose::DeliveryStream",
        Properties: {
          DeliveryStreamName: "order-events",
          DeliveryStreamType: "DirectPut",
          ExtendedS3DestinationConfiguration: {
            BucketARN: { "Fn::GetAtt": ["OrderArchive", "Arn"] },
            RoleARN: { "Fn::GetAtt": ["DeliveryRole", "Arn"] },
            Prefix: "orders/",
            BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 1 },
          },
        },
      },
    },
    Outputs: {
      DeliveryStreamArn: { Value: { "Fn::GetAtt": ["OrderEvents", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

// arn:aws:firehose:us-east-1:<account>:deliverystream/order-events
console.log(stack.outputs.get("DeliveryStreamArn")?.value);

await simAws.firehose().putRecord(
  new PutRecordCommand({
    DeliveryStreamName: "order-events",
    Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
  }),
);

await simAws.clock().advanceBy({ minutes: 2 });

const { Contents } = await simAws
  .s3()
  .listObjectsV2(new ListObjectsV2Command({ Bucket: "order-archive" }));

// orders/2026/08/22/13/order-events-1-2026-08-22-13-51-01-92076704-cf4a-...
console.log(Contents?.[0]?.Key);

import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The Bucket every delivery stream template here archives into.
 */
export const orderArchiveBucketName = "order-archive";

/**
 * The S3 actions real Firehose requires a delivery Role to be allowed before it
 * will write a buffer.
 */
export const firehoseDeliveryActions: readonly string[] = [
  "s3:AbortMultipartUpload",
  "s3:GetBucketLocation",
  "s3:GetObject",
  "s3:ListBucket",
  "s3:ListBucketMultipartUploads",
  "s3:PutObject",
];

/**
 * The Kinesis actions real Firehose requires a source Role to be allowed before
 * it will read a stream.
 */
const sourceActions: readonly string[] = [
  "kinesis:DescribeStream",
  "kinesis:GetRecords",
  "kinesis:GetShardIterator",
  "kinesis:ListShards",
];

/**
 * The Bucket the delivery stream writes into.
 */
export const orderArchiveBucket: SimCfnTemplateValueRecord = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: orderArchiveBucketName },
};

/**
 * The Role the delivery writes as, allowed the S3 actions given.
 */
export function orderArchiveDeliveryRole(
  allowedActions: readonly string[],
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: "OrderArchiveDeliveryRole",
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
                Action: [...allowedActions],
                Resource: `arn:aws:s3:::${orderArchiveBucketName}/*`,
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * The stream a Kinesis-sourced delivery stream reads.
 */
export function orderSourceStream(
  streamName: string,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::Kinesis::Stream",
    Properties: { Name: streamName, ShardCount: 1 },
  };
}

/**
 * The Role a Kinesis-sourced delivery stream reads its stream as.
 */
export function orderSourceRole(): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: "OrderStreamSourceRole",
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
          PolicyName: "ReadOrders",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [...sourceActions],
                Resource: { "Fn::GetAtt": ["OrderStream", "Arn"] },
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * The destination CDK synthesizes for a `DeliveryStream` with an `S3Bucket`,
 * reading the Bucket and the Role off the Resources beside it.
 *
 * A test states this as its destination and changes what it is about, which is
 * how a template a CDK project would have produced stays the starting point.
 */
export const cdkS3Destination: SimCfnTemplateValueRecord = {
  BucketARN: { "Fn::GetAtt": ["OrderArchive", "Arn"] },
  RoleARN: { "Fn::GetAtt": ["DeliveryRole", "Arn"] },
  Prefix: "orders/",
  BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 1 },
};

/**
 * The source CDK synthesizes for a `DeliveryStream` with a `KinesisStreamSource`,
 * reading the stream and the Role off the Resources beside it.
 */
export const cdkKinesisSource: SimCfnTemplateValueRecord = {
  KinesisStreamARN: { "Fn::GetAtt": ["OrderStream", "Arn"] },
  RoleARN: { "Fn::GetAtt": ["SourceRole", "Arn"] },
};

/**
 * The delivery stream a test that states no properties of its own gets.
 */
export const cdkDeliveryStreamProperties: SimCfnTemplateValueRecord = {
  DeliveryStreamName: "order-events",
  DeliveryStreamType: "DirectPut",
  ExtendedS3DestinationConfiguration: cdkS3Destination,
};

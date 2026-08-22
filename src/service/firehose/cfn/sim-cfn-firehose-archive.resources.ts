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

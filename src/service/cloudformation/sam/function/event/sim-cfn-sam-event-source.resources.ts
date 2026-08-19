import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";

/**
 * The Resources a SAM event points at, which the template declares itself.
 *
 * An event names a queue, a stream, a topic or a Bucket that already exists,
 * so every test about one needs the thing it names standing beside the
 * function. None of them is what any of these tests is about.
 */

/**
 * The queue an `SQS` event polls.
 */
export const ordersQueue: SimCfnTemplateValueRecord = {
  Type: "AWS::SQS::Queue",
  Properties: { QueueName: "orders" },
};

/**
 * The streamed table a `DynamoDB` event reads.
 */
export const ordersTable: SimCfnTemplateValueRecord = {
  Type: "AWS::DynamoDB::Table",
  Properties: {
    TableName: "orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
  },
};

/**
 * The topic an `SNS` event subscribes to.
 */
export const ordersTopic: SimCfnTemplateValueRecord = {
  Type: "AWS::SNS::Topic",
  Properties: { TopicName: "orders" },
};

/**
 * The Bucket an `S3` event is notified by.
 */
export const uploadsBucket: SimCfnTemplateValueRecord = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "uploads" },
};

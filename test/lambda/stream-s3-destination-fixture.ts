/**
 * A failing stream mapping whose failure destination is an S3 Bucket.
 *
 * This lives under `test/` for the same reason as the other fixtures here.
 * Eslint rejects a test file that exports helpers alongside its own `describe`
 * calls.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { CreateBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { faker } from "@faker-js/faker";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimKinesisEventSourceFixture } from "./kinesis-event-source-fixture.js";
import type { SimDynamoDbStreamEventSourceFixture } from "./stream-event-source-fixture.js";
import { simAwsWithKinesisEventSource } from "./kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "./stream-event-source-fixture.js";

/**
 * A failing stream mapping on each source, whose failure destination is a
 * Bucket its role may write to with the actions given.
 */
export async function failingMappingWithBucket(
  source: "dynamodb" | "kinesis",
  actions: readonly string[],
  filterPatterns?: readonly string[],
): Promise<
  (SimDynamoDbStreamEventSourceFixture | SimKinesisEventSourceFixture) & {
    readonly bucket: string;
  }
> {
  const simAws = new SimAws();
  const bucket = faker.string.alphanumeric({ length: 12, casing: "lower" });
  await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: bucket }));
  const options = {
    simAws,
    ...(filterPatterns !== undefined && { filterPatterns }),
    destinationArn: `arn:aws:s3:::${bucket}`,
    maximumRetryAttempts: 1,
    handlerResult: (): never => {
      throw new Error("Cannot process the record");
    },
  };
  const fixture =
    source === "dynamodb"
      ? await simAwsWithStreamEventSource(options)
      : await simAwsWithKinesisEventSource(options);
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderProjectorRole",
      PolicyName: "StoreFailures",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: actions,
            Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    }),
  );
  await simAws.backgroundTasksComplete();

  return { ...fixture, simAws, bucket };
}

/**
 * Write one record to the mapping's source, and let it be delivered.
 */
export async function writeStreamRecord(
  simAws: SimAws,
  source: "dynamodb" | "kinesis",
): Promise<void> {
  await (source === "dynamodb"
    ? simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: "orders",
          Item: { orderId: { S: faker.string.uuid() } },
        }),
      )
    : simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "order",
          Data: new TextEncoder().encode("order"),
        }),
      ));
  await simAws.backgroundTasksComplete();
}

/**
 * The keys of every object in a Bucket.
 */
export async function bucketKeys(
  simAws: SimAws,
  bucket: string,
): Promise<string[]> {
  const listed = await simAws
    .s3()
    .listObjectsV2(new ListObjectsV2Command({ Bucket: bucket }));

  return (listed.Contents ?? []).map((object) => object.Key ?? "");
}

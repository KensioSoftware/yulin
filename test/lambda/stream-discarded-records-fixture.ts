import type { SimDynamoDbStreamEventSourceFixture } from "./stream-event-source-fixture.js";
import type { SimKinesisEventSourceFixture } from "./kinesis-event-source-fixture.js";
import { faker } from "@faker-js/faker";
import { assertNonNullable } from "@kensio/smartass";
import { simAwsWithKinesisEventSource } from "./kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "./stream-event-source-fixture.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimLambdaKinesisStreamEvent } from "../../src/service/lambda/event-source/poll/kinesis/sim-lambda-kinesis-stream-event.types.js";
import type { SimLambdaDynamoDbStreamEvent } from "../../src/service/lambda/event-source/poll/sim-lambda-dynamodb-stream-event.types.js";
import type { SimLambdaStreamFailureRecord } from "../../src/service/lambda/event-source/poll/sim-lambda-stream-failure-record.js";

function sequenceNumbers(
  event: SimLambdaDynamoDbStreamEvent | SimLambdaKinesisStreamEvent,
): string[] {
  return event.Records.map((record) => {
    if ("dynamodb" in record) return record.dynamodb.SequenceNumber;
    return record.kinesis.sequenceNumber;
  });
}

/** Create a stream consumer that records the sequence numbers in each invocation. */
type DestinationFixture = (
  | SimDynamoDbStreamEventSourceFixture
  | SimKinesisEventSourceFixture
) & {
  readonly destinationArn: string;
  readonly write: () => Promise<void>;
  readonly receive: () => Promise<SimLambdaStreamFailureRecord[]>;
  readonly seen: string[][];
};

/** Create a stream consumer that records the sequence numbers in each invocation. */
export async function stream_discarded_records_fixture(
  source: string,
  partial = true,
): Promise<DestinationFixture> {
  const simAws = new SimAws();
  const queue = await simAws
    .sqs()
    .createQueue({ input: { QueueName: faker.string.uuid() } });
  const attributes = await simAws.sqs().getQueueAttributes({
    input: { QueueUrl: queue.QueueUrl, AttributeNames: ["QueueArn"] },
  });
  const destinationArn = attributes.Attributes?.["QueueArn"];
  assertNonNullable(destinationArn);
  const seen: string[][] = [];
  const options = {
    simAws,
    destinationArn,
    maximumRecordAgeInSeconds: 60,
    functionResponseTypes: ["ReportBatchItemFailures"] as const,
    handlerResult: (
      event: SimLambdaDynamoDbStreamEvent | SimLambdaKinesisStreamEvent,
    ): { batchItemFailures: { itemIdentifier: string | undefined }[] } => {
      const numbers = sequenceNumbers(event);
      seen.push(numbers);
      if (!partial) throw new Error("Failed batch");
      return {
        batchItemFailures: [{ itemIdentifier: numbers.at(1) ?? numbers.at(0) }],
      };
    },
  };
  const fixture =
    source === "dynamodb"
      ? await simAwsWithStreamEventSource(options)
      : await simAwsWithKinesisEventSource(options);
  await simAws.iam().putRolePolicy({
    input: {
      RoleName: "OrderProjectorRole",
      PolicyName: "SendFailures",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "sqs:SendMessage",
            Resource: destinationArn,
          },
        ],
      }),
    },
  });
  async function write(): Promise<void> {
    if (source === "dynamodb") {
      await simAws.dynamoDb().putItem({
        input: {
          TableName: "orders",
          Item: { orderId: { S: faker.string.uuid() } },
        },
      });
    } else {
      await simAws.kinesis().putRecord({
        input: {
          StreamName: "orders",
          PartitionKey: "one-shard",
          Data: new TextEncoder().encode(faker.string.uuid()),
        },
      });
    }
  }
  async function receive(): Promise<SimLambdaStreamFailureRecord[]> {
    const messages = await simAws.sqs().receiveMessage({
      input: { QueueUrl: queue.QueueUrl, MaxNumberOfMessages: 10 },
    });
    return (messages.Messages ?? []).map(
      (message) => JSON.parse(message.Body) as SimLambdaStreamFailureRecord,
    );
  }
  return { ...fixture, destinationArn, seen, write, receive };
}

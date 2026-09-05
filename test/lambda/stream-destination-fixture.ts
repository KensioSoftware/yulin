import type { SimDynamoDbStreamEventSourceFixture } from "./stream-event-source-fixture.js";
import type { SimKinesisEventSourceFixture } from "./kinesis-event-source-fixture.js";
import { faker } from "@faker-js/faker";
import { assertNonNullable } from "@kensio/smartass";
import { simAwsWithKinesisEventSource } from "./kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "./stream-event-source-fixture.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimLambdaStreamFailureRecord } from "../../src/service/lambda/event-source/poll/sim-lambda-stream-failure-record.js";

/** Create a stream consumer and a queue that receives its destination notifications. */
type DestinationFixture = (
  | SimDynamoDbStreamEventSourceFixture
  | SimKinesisEventSourceFixture
) & {
  readonly destinationArn: string;
  readonly write: () => Promise<void>;
  readonly receive: () => Promise<SimLambdaStreamFailureRecord[]>;
};

/** Create a stream consumer and a queue that receives its destination notifications. */
export async function stream_destination_fixture(
  source: string,
  destination: string,
  boundary: string,
  permission = true,
  succeeds = false,
): Promise<DestinationFixture> {
  const simAws = new SimAws();
  const name = faker.string.uuid();
  const queue = await simAws.sqs().createQueue({ input: { QueueName: name } });
  const queueUrl = queue.QueueUrl;
  const attributes = await simAws.sqs().getQueueAttributes({
    input: { QueueUrl: queueUrl, AttributeNames: ["QueueArn"] },
  });
  const queueArn = attributes.Attributes?.["QueueArn"];
  assertNonNullable(queueArn);
  let destinationArn = queueArn;
  if (destination === "sns") {
    const topic = await simAws.sns().createTopic({ input: { Name: name } });
    assertNonNullable(topic.TopicArn);
    destinationArn = topic.TopicArn;
    await simAws.sqs().setQueueAttributes({
      input: {
        QueueUrl: queueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "sns.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: queueArn,
              },
            ],
          }),
        },
      },
    });
    await simAws.sns().subscribe({
      input: {
        TopicArn: destinationArn,
        Protocol: "sqs",
        Endpoint: queueArn,
        Attributes: { RawMessageDelivery: "true" },
      },
    });
  }
  const options = {
    simAws,
    destinationArn,
    ...limits(boundary),
    handlerResult: (): undefined => {
      if (!succeeds) throw new Error("Cannot process the record");
      return;
    },
  };
  const fixture =
    source === "dynamodb"
      ? await simAwsWithStreamEventSource(options)
      : await simAwsWithKinesisEventSource(options);
  if (permission) {
    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "OrderProjectorRole",
        PolicyName: "DeliverFailure",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: `${destination}:*`,
              Resource: destinationArn,
            },
          ],
        }),
      },
    });
  }
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
          PartitionKey: name,
          Data: new TextEncoder().encode(name),
        },
      });
    }
  }
  async function receive(): Promise<SimLambdaStreamFailureRecord[]> {
    const result = await simAws.sqs().receiveMessage({
      input: { QueueUrl: queueUrl, MaxNumberOfMessages: 10 },
    });
    await Promise.all(
      (result.Messages ?? []).map(async (message) => {
        await simAws.sqs().deleteMessage({
          input: {
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          },
        });
      }),
    );
    return (result.Messages ?? []).map(
      (message) => JSON.parse(message.Body) as SimLambdaStreamFailureRecord,
    );
  }
  return { ...fixture, write, receive, destinationArn };
}

function limits(boundary: string): {
  maximumRetryAttempts?: number;
  maximumRecordAgeInSeconds?: number;
} {
  if (boundary === "age") return { maximumRecordAgeInSeconds: 60 };
  return { maximumRetryAttempts: 1 };
}

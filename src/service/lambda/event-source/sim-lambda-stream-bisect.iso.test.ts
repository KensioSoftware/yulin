import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaStreamFailureRecord } from "./poll/sim-lambda-stream-failure-record.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

/**
 * The orders written to the source, one of which the function cannot handle.
 */
const orderIds = ["order-1", "order-2", "order-3", "order-4"];

/**
 * The order whose record breaks every batch it is in.
 */
const poisonOrderId = "order-3";

/**
 * A handler that throws on any batch holding the poison record, and takes every
 * other batch.
 *
 * This is what a bisecting mapping is for. The batch has to be split before the
 * three records beside the poison one can be handled.
 */
function throwingOnPoison<EventType>(
  orderIdsIn: (event: EventType) => readonly string[],
): (event: EventType) => unknown {
  return (event: EventType): unknown => {
    if (orderIdsIn(event).includes(poisonOrderId)) {
      throw new Error(`Projector cannot handle ${poisonOrderId}`);
    }

    return undefined;
  };
}

function streamOrderIds(
  event: SimLambdaDynamoDbStreamEvent,
): readonly string[] {
  return event.Records.map(
    (record) => record.dynamodb.Keys?.["orderId"]?.S ?? "",
  );
}

function kinesisOrderIds(
  event: SimLambdaKinesisStreamEvent,
): readonly string[] {
  return event.Records.map((record) =>
    new TextDecoder().decode(Buffer.from(record.kinesis.data, "base64")),
  );
}

/**
 * The orders each delivery carried, one line per delivery, in the order they
 * were delivered.
 */
function deliveries<EventType>(
  events: readonly EventType[],
  orderIdsIn: (event: EventType) => readonly string[],
): string[] {
  return events.map((event) => orderIdsIn(event).join(", "));
}

/**
 * Write every order to the table at once, so one poll reads them as one batch.
 */
async function writeOrders(simAws: SimAws, tableName: string): Promise<void> {
  await Promise.all(
    orderIds.map(async (orderId) =>
      simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: tableName,
          Item: { orderId: { S: orderId } },
        }),
      ),
    ),
  );
  await simAws.backgroundTasksComplete();
}

/**
 * Put every order onto one Kinesis shard at once.
 */
async function putOrders(simAws: SimAws): Promise<void> {
  await Promise.all(
    orderIds.map(async (orderId) =>
      simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          Data: new TextEncoder().encode(orderId),
        }),
      ),
    ),
  );
  await simAws.backgroundTasksComplete();
}

describe("bisecting a stream batch a function threw on", () => {
  it("splits a failed batch until the record that broke it is on its own", async () => {
    // Given a bisecting stream mapping allowing a failed batch one retry,
    // whose function throws on any batch holding one of the four records.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwingOnPoison(streamOrderIds),
      bisectBatchOnFunctionError: true,
      maximumRetryAttempts: 1,
    });

    // When the four records are written and the retries are waited out.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch halved around the record that broke it, the three
    // records beside it were handled, and it was delivered on its own.
    assertArrayEquals(deliveries(events, streamOrderIds), [
      "order-1, order-2, order-3, order-4",
      "order-1, order-2",
      "order-3, order-4",
      "order-3",
      "order-4",
    ]);
  });

  it("retries the whole batch when the mapping did not ask to bisect", async () => {
    // Given the same mapping and function, without the bisect setting.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwingOnPoison(streamOrderIds),
      maximumRetryAttempts: 1,
    });

    // When the four records are written and the retry is waited out.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was delivered whole both times, and the three records
    // beside the poison one were discarded with it.
    assertArrayEquals(deliveries(events, streamOrderIds), [
      "order-1, order-2, order-3, order-4",
      "order-1, order-2, order-3, order-4",
    ]);
  });

  it("splits a failed Kinesis batch the same way", async () => {
    // Given a bisecting Kinesis mapping allowing a failed batch one retry.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      handlerResult: throwingOnPoison(kinesisOrderIds),
      bisectBatchOnFunctionError: true,
      maximumRetryAttempts: 1,
    });

    // When the four records are put onto one shard and the retries are waited
    // out.
    await putOrders(simAws);
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the shard's batch halved around the record that broke it.
    assertArrayEquals(deliveries(events, kinesisOrderIds), [
      "order-1, order-2, order-3, order-4",
      "order-1, order-2",
      "order-3, order-4",
      "order-3",
      "order-4",
    ]);
  });

  it("sends only the isolated record to the failure destination", async () => {
    // Given a queue for failure notifications, and a bisecting mapping
    // allowed to send to it that has one retry for a batch it cannot handle.
    const simAws = new SimAws();
    const queueUrl = await makeFailureQueue(simAws);
    const queueArn = await queueArnOf(simAws, queueUrl);
    const { tableName } = await simAwsWithStreamEventSource({
      simAws,
      handlerResult: throwingOnPoison(streamOrderIds),
      bisectBatchOnFunctionError: true,
      maximumRetryAttempts: 1,
      destinationArn: queueArn,
    });

    await allowSendingTo(simAws, queueArn);

    // When the four records are written and the retries are waited out.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ hours: 1 });

    // Then one notification arrives, and it names the one record the splitting
    // isolated rather than the batch of four it started as.
    const records = await receiveFailures(simAws, queueUrl);

    assertArrayLength(records, 1);

    const info = records[0].DDBStreamBatchInfo;

    assertNonNullable(info);
    assertIdentical(info.batchSize, 1);
    assertIdentical(info.startSequenceNumber, info.endSequenceNumber);
  });
});

/**
 * A queue for the mapping to send its failure notifications to.
 */
async function makeFailureQueue(simAws: SimAws): Promise<string> {
  const queue = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "discarded-orders" }));

  assertNonNullable(queue.QueueUrl);

  return queue.QueueUrl;
}

async function queueArnOf(simAws: SimAws, queueUrl: string): Promise<string> {
  const attributes = await simAws.sqs().getQueueAttributes(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["QueueArn"],
    }),
  );
  const queueArn = attributes.Attributes?.["QueueArn"];

  assertNonNullable(queueArn);

  return queueArn;
}

/**
 * Let the execution role send to the destination, which is what real Lambda
 * checks before delivering a failure notification.
 */
async function allowSendingTo(simAws: SimAws, queueArn: string): Promise<void> {
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderProjectorRole",
      PolicyName: "DeliverFailure",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "sqs:SendMessage", Resource: queueArn },
        ],
      }),
    }),
  );
}

async function receiveFailures(
  simAws: SimAws,
  queueUrl: string,
): Promise<SimLambdaStreamFailureRecord[]> {
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }),
  );

  return (received.Messages ?? []).map(
    (message) => JSON.parse(message.Body) as SimLambdaStreamFailureRecord,
  );
}

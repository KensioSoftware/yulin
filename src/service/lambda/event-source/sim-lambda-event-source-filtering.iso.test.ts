import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { PutRecordCommand } from "@aws-sdk/client-kinesis";
import { ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";
import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";
import type { SimLambdaKinesisStreamEvent } from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

/**
 * A record carrying one order, as a producer puts it onto a stream.
 */
function orderRecord(type: string): PutRecordCommand {
  const data = JSON.stringify({ order: { type, stock: "ANYCO" } });

  return new PutRecordCommand({
    StreamName: "orders",
    PartitionKey: "customer-1",
    Data: new TextEncoder().encode(data),
  });
}

/**
 * What one Kinesis record's base64 payload says.
 */
function kinesisPayload(data: string): { order: { type: string } } {
  const decoded = Buffer.from(data, "base64").toString("utf8");

  return JSON.parse(decoded) as { order: { type: string } };
}

/**
 * The order ids a DynamoDB stream batch carries.
 */
function streamedOrderIds(
  event: SimLambdaDynamoDbStreamEvent,
): readonly string[] {
  return event.Records.map(
    (record) => record.dynamodb.Keys?.["orderId"]?.S ?? "",
  );
}

describe("sim Lambda event source mapping filter criteria", () => {
  it("delivers a queue message its filter matches and deletes one it does not", async () => {
    // Given a queue mapping filtering on a field of the message body.
    const { queueUrl, events, simAws } = await simAwsWithSqsEventSource({
      filterPatterns: ['{"body":{"status":["shipped"]}}'],
    });

    // When one order of each status is sent.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ orderId: "order-1", status: "placed" }),
      }),
    );
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ orderId: "order-2", status: "shipped" }),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the shipped order reached the function.
    const records = events.flatMap((event) => event.Records);
    const bodies = records.map(
      (record) => JSON.parse(record.body) as { orderId: string },
    );

    assertArrayEquals(
      bodies.map((body) => body.orderId),
      ["order-2"],
    );

    // And the message the filter excluded was deleted rather than left on the
    // queue, as real Lambda deletes one.
    const left = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayEmpty(left.Messages ?? []);
  });

  it("invokes nothing when a queue batch is filtered out in full", async () => {
    // Given a queue mapping whose filter matches nothing that is sent.
    const { queueUrl, events, simAws } = await simAwsWithSqsEventSource({
      filterPatterns: ['{"body":{"status":["shipped"]}}'],
    });

    // When an order the filter excludes is sent.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ orderId: "order-1", status: "placed" }),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the function was never invoked, and the message is gone.
    assertArrayEmpty(events);

    const left = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertArrayEmpty(left.Messages ?? []);
  });

  it("delivers a stream record its filter matches and moves past one it does not", async () => {
    // Given a stream mapping filtering on the event name and an image field.
    const { tableName, events, simAws } = await simAwsWithStreamEventSource({
      filterPatterns: [
        '{"eventName":["MODIFY"],"dynamodb":{"NewImage":{"status":{"S":["shipped"]}}}}',
      ],
    });

    // When an order is written and then twice modified.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, status: { S: "placed" } },
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, status: { S: "packed" } },
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, status: { S: "shipped" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the shipping change reached the function.
    const delivered = events.flatMap((event) => event.Records);

    assertArrayLength(delivered, 1);
    assertIdentical(delivered[0].dynamodb.NewImage?.["status"]?.S, "shipped");
  });

  it("keeps reading a stream past a batch its filter excluded in full", async () => {
    // Given a stream mapping reading one record at a time, filtering on a
    // status the first write does not carry.
    const { tableName, events, simAws } = await simAwsWithStreamEventSource({
      batchSize: 1,
      filterPatterns: [
        '{"dynamodb":{"NewImage":{"status":{"S":["shipped"]}}}}',
      ],
    });

    // When an excluded order is written before a matching one.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, status: { S: "placed" } },
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-2" }, status: { S: "shipped" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the checkpoint moved past the excluded record and the matching one
    // arrived behind it.
    assertArrayEquals(events.flatMap(streamedOrderIds), ["order-2"]);
  });

  it("delivers a Kinesis record whose decoded payload its filter matches", async () => {
    // Given a Kinesis mapping filtering on a field of the record's JSON data.
    const { events, simAws } = await simAwsWithKinesisEventSource({
      filterPatterns: ['{"data":{"order":{"type":["buy"]}}}'],
    });

    // When a sell and a buy are put onto the stream.
    await simAws.kinesis().putRecord(orderRecord("sell"));
    await simAws.kinesis().putRecord(orderRecord("buy"));
    await simAws.backgroundTasksComplete();

    // Then only the buy reached the function.
    const delivered = events.flatMap(
      (event: SimLambdaKinesisStreamEvent) => event.Records,
    );
    const payloads = delivered.map((record) =>
      kinesisPayload(record.kinesis.data),
    );

    assertArrayEquals(
      payloads.map((payload) => payload.order.type),
      ["buy"],
    );
  });

  it("delivers a record matching any one of several filters", async () => {
    // Given a queue mapping carrying two patterns, which real Lambda ORs.
    const { queueUrl, events, simAws } = await simAwsWithSqsEventSource({
      filterPatterns: [
        '{"body":{"status":["shipped"]}}',
        '{"body":{"status":["cancelled"]}}',
      ],
    });

    // When one order of each of three statuses is sent.
    await Promise.all(
      ["placed", "shipped", "cancelled"].map(async (status) => {
        await simAws.sqs().sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify({ status }),
          }),
        );
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then both of the named statuses reached the function.
    const statuses = events
      .flatMap((event) => event.Records)
      .map((record) => (JSON.parse(record.body) as { status: string }).status);

    assertArrayEquals(
      statuses.toSorted((a, b) => a.localeCompare(b)),
      ["cancelled", "shipped"],
    );
  });

  it("reports the filters a mapping was created with", async () => {
    // Given a mapping created with a filter.
    const pattern = '{"body":{"status":["shipped"]}}';
    const { uuid, simAws } = await simAwsWithSqsEventSource({
      filterPatterns: [pattern],
    });

    // When the mapping is read back.
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    // Then it reports the pattern as it was written.
    assertArrayEquals(
      (mapping.FilterCriteria?.Filters ?? []).map((filter) => filter.Pattern),
      [pattern],
    );
  });

  it("reports no filters for a mapping created without any", async () => {
    // Given a mapping created with no filter.
    const { uuid, simAws } = await simAwsWithSqsEventSource();

    // When the mapping is read back.
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    // Then it reports none, rather than an empty list of them.
    assertUndefined(mapping.FilterCriteria);
  });
});

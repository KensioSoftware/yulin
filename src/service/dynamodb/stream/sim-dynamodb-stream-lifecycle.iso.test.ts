import {
  DescribeTableCommand,
  PutItemCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import type { UpdateTableCommandInput } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDbTableDescription } from "../command/table/table.types.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * Describe the table every test here works on.
 */
async function describeOrders(
  simAws: SimAws,
): Promise<SimDynamoDbTableDescription> {
  const described = await simAws
    .dynamoDb()
    .describeTable(new DescribeTableCommand({ TableName: "orders" }));
  assertDefined(described.Table, "DynamoDB table description");

  return described.Table;
}

/**
 * Update the table every test here works on, and answer with what it refused.
 */
async function refusedUpdate(
  simAws: SimAws,
  input: Omit<UpdateTableCommandInput, "TableName">,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws
      .dynamoDb()
      .updateTable(new UpdateTableCommand({ TableName: "orders", ...input }));
  });
}

describe("DynamoDB stream lifecycle", () => {
  it("reports the stream a table was created with", async () => {
    // Given a table created with a stream.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make(
      { viewType: "NEW_AND_OLD_IMAGES" },
      simAws,
    );

    // When the table is described.
    const description = await describeOrders(simAws);

    // Then it reports the specification, and the ARN and label of the stream
    // that specification made, which is on and taking changes.
    assertObjectEquals(description.StreamSpecification, {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    });
    assertIdentical(table.stream.current?.status, "ENABLED");
    assertStringStartsWith(
      description.LatestStreamArn ?? "",
      "arn:aws:dynamodb:",
    );
    assertDefined(description.LatestStreamLabel, "latest stream label");
    assertStringIncludes(
      description.LatestStreamArn ?? "",
      `:table/orders/stream/${description.LatestStreamLabel}`,
    );
  });

  it("reports nothing for a table that never had a stream", async () => {
    // Given a table created without one.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );

    // Then it reports no specification at all, rather than one that is off.
    const description = await describeOrders(simAws);
    assertUndefined(description.StreamSpecification);
    assertUndefined(description.LatestStreamArn);
    assertUndefined(description.LatestStreamLabel);
  });

  it("switches a stream on for a table that has none", async () => {
    // Given a table with no stream, holding an item written before it had one.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When a stream is switched on and another item is written.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: {
          StreamEnabled: true,
          StreamViewType: "NEW_IMAGE",
        },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-2" } },
      }),
    );

    // Then the stream carries what changed after it was switched on, and
    // nothing from before: a stream is a log of transitions rather than a
    // view of the table.
    assertArrayLength(table.stream.latest?.records ?? [], 1);
    assertObjectEquals(
      table.stream.latest?.records[0]?.newImage?.toAttributeValues(),
      { orderId: { S: "order-2" } },
    );
  });

  it("switches a stream off, keeping what it captured", async () => {
    // Given a streamed table holding an item.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When the stream is switched off and another item is written.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-2" } },
      }),
    );

    // Then the table reports the stream as off while still naming it, since
    // AWS keeps the last stream's ARN on a table that has switched it off.
    const description = await describeOrders(simAws);
    assertObjectEquals(description.StreamSpecification, {
      StreamEnabled: false,
    });
    assertDefined(description.LatestStreamArn, "latest stream ARN");

    // And the stream kept the record it had already taken, and took no more.
    // Its shard is closed, which is how a reader finds out there will be no
    // more coming.
    assertArrayLength(table.stream.latest?.records ?? [], 1);
    assertUndefined(table.stream.current);
    assertIdentical(table.stream.latest?.status, "DISABLED");
    assertFalse(table.stream.latest.shard.isOpen);
  });

  it("gives a re-enabled stream an ARN of its own", async () => {
    // Given a streamed table whose stream has been switched off, on a clock
    // that has not moved since it was switched on. A label is the instant the
    // stream was enabled, so this is the case where two of them would collide.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-04T09:00:00.000Z")),
    });
    await simDynamoDbStreamedTableFactory.make({}, simAws);
    const before = await describeOrders(simAws);
    const first = before.LatestStreamArn;
    const firstLabel = before.LatestStreamLabel;
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a stream is switched on again, with a different view type.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: {
          StreamEnabled: true,
          StreamViewType: "KEYS_ONLY",
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it is a new stream, with a label and an ARN of its own, and
    // anything holding the old ARN is holding the old stream.
    const description = await describeOrders(simAws);
    assertObjectEquals(description.StreamSpecification, {
      StreamEnabled: true,
      StreamViewType: "KEYS_ONLY",
    });
    assertDefined(first, "first stream ARN");
    assertDefined(description.LatestStreamArn, "second stream ARN");
    assertFalse(description.LatestStreamArn === first);

    // The label is what tells them apart inside the ARN, and it is the instant
    // the stream was enabled, which the clock has not moved past.
    assertDefined(firstLabel, "first stream label");
    assertDefined(description.LatestStreamLabel, "second stream label");
    assertFalse(description.LatestStreamLabel === firstLabel);
  });

  it("refuses switching on a stream the table already has", async () => {
    // Given a table whose stream is already on.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make({}, simAws);

    // When the same stream is asked for again.
    const error = await refusedUpdate(simAws, {
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    });

    // Then it is refused rather than quietly replacing the stream.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "already has an enabled stream");
  });

  it("refuses changing a stream's view type in place", async () => {
    // Given a table whose stream is on with one view type.
    const simAws = new SimAws();
    await simDynamoDbStreamedTableFactory.make(
      { viewType: "NEW_IMAGE" },
      simAws,
    );

    // When another view type is asked for on the same stream.
    const error = await refusedUpdate(simAws, {
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "OLD_IMAGE",
      },
    });

    // Then it is refused, saying what to do instead: a view type belongs to
    // the stream, so a different one means a different stream.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "cannot be changed in place");
  });

  it("refuses switching off a stream the table does not have", async () => {
    // Given a table with no stream.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );

    // When the stream is switched off.
    const error = await refusedUpdate(simAws, {
      StreamSpecification: { StreamEnabled: false },
    });

    // Then it is refused rather than accepted as a request for the state the
    // table is already in.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "does not have an enabled stream");
  });

  it("refuses switching a stream on without a view type", async () => {
    // Given a table with no stream.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders", partitionKeyName: "orderId" },
      simAws,
    );

    // When a stream is asked for without saying which images it carries.
    const error = await refusedUpdate(simAws, {
      StreamSpecification: { StreamEnabled: true },
    });

    // Then it is refused, since a record with no view type would have no rule
    // about which images it carries.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "StreamViewType is required");
  });

  it("refuses a view type DynamoDB does not have", async () => {
    // When a table is created asking for a view type that is not one.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().createTable({
        input: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: {
            StreamEnabled: true,
            StreamViewType: "BOTH_IMAGES",
          },
        },
      }),
    );

    // Then it is refused naming what was asked for.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Unknown StreamViewType BOTH_IMAGES");
  });

  it("refuses a stream specification that does not say whether it is on", async () => {
    // When a table is created with a specification carrying only a view type.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().createTable({
        input: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: { StreamViewType: "NEW_IMAGE" },
        },
      }),
    );

    // Then it is refused, rather than making a table with no stream out of a
    // request that plainly asked for one.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "StreamEnabled is required");
  });
});

import {
  DeleteItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * The keys every record here carries.
 */
const keys = { orderId: { S: "order-1" } };

/**
 * The item as it is written, and as it is written again.
 */
const firstOrder = { ...keys, total: { N: "101" } };
const secondOrder = { ...keys, total: { N: "202" } };

/**
 * What a table's stream captured, oldest first.
 */
function capturedBy(
  table: SimDynamoDbTable,
): readonly SimDynamoDbStreamRecord[] {
  return table.stream.latest?.records ?? [];
}

/**
 * The record a change left at a position, which is always there.
 */
function recordAt(
  table: SimDynamoDbTable,
  position: number,
): SimDynamoDbStreamRecord {
  const record = capturedBy(table).at(position);
  assertDefined(record, "DynamoDB stream record");

  return record;
}

/**
 * Write an item onto the streamed table.
 */
async function putOrder(
  simAws: SimAws,
  item: Record<string, { S: string } | { N: string }>,
): Promise<void> {
  await simAws
    .dynamoDb()
    .putItem(new PutItemCommand({ TableName: "orders", Item: item }));
}

describe("DynamoDB stream capture", () => {
  it("captures an INSERT for the first write of an item", async () => {
    // Given a table with a stream.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);

    // When an item is written for the first time.
    await putOrder(simAws, firstOrder);

    // Then the change is on the stream as an insertion, carrying the keys and
    // the item that was written and nothing before it.
    const record = recordAt(table, 0);
    assertIdentical(record.eventName, "INSERT");
    assertObjectEquals(record.keys.toAttributeValues(), keys);
    assertObjectEquals(record.newImage?.toAttributeValues(), firstOrder);
    assertUndefined(record.oldImage);
    assertUndefined(record.userIdentity);
  });

  it("captures a MODIFY with both images for a second write", async () => {
    // Given an item that has been written once.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, firstOrder);

    // When the same key is written again.
    await putOrder(simAws, secondOrder);

    // Then the second change is a modification carrying what the item was and
    // what it became.
    const record = recordAt(table, 1);
    assertIdentical(record.eventName, "MODIFY");
    assertObjectEquals(record.oldImage?.toAttributeValues(), firstOrder);
    assertObjectEquals(record.newImage?.toAttributeValues(), secondOrder);
  });

  it("captures a REMOVE carrying the old image and no new one", async () => {
    // Given an item on a streamed table.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, firstOrder);

    // When the application deletes it.
    await simAws
      .dynamoDb()
      .deleteItem(new DeleteItemCommand({ TableName: "orders", Key: keys }));

    // Then the removal carries what was taken away, and no identity: the
    // application asked for this one itself.
    const record = recordAt(table, 1);
    assertIdentical(record.eventName, "REMOVE");
    assertObjectEquals(record.oldImage?.toAttributeValues(), firstOrder);
    assertUndefined(record.newImage);
    assertUndefined(record.userIdentity);
  });

  it("captures a MODIFY for an update that changes nothing", async () => {
    // Given an item on a streamed table.
    const simAws = new SimAws();
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await putOrder(simAws, firstOrder);

    // When UpdateItem is called with no UpdateExpression, which stores the
    // item that was already there.
    await simAws
      .dynamoDb()
      .updateItem(new UpdateItemCommand({ TableName: "orders", Key: keys }));

    // Then the write is captured anyway. Real DynamoDB writes a record for
    // that request too, so comparing the images to decide would report less
    // than AWS does.
    assertIdentical(recordAt(table, 1).eventName, "MODIFY");
  });
});

import { DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * The item every test here writes.
 */
const order = { orderId: { S: "order-1" }, total: { N: "101" } };

/**
 * Write an order, change it and delete it on a stream of one view type, and
 * answer with the three records that came out.
 *
 * Every test here is the same three changes read through a different view
 * type, so the changes are made once and each test says what it expects to
 * find on them.
 */
async function recordsUnder(
  viewType: SimDynamoDbStreamViewType,
): Promise<readonly SimDynamoDbStreamRecord[]> {
  const simAws = new SimAws();
  const table = await simDynamoDbStreamedTableFactory.make(
    { viewType },
    simAws,
  );

  await simAws
    .dynamoDb()
    .putItem(new PutItemCommand({ TableName: "orders", Item: order }));
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { ...order, total: { N: "202" } },
    }),
  );
  await simAws.dynamoDb().deleteItem(
    new DeleteItemCommand({
      TableName: "orders",
      Key: { orderId: { S: "order-1" } },
    }),
  );

  return table.stream.latest?.records ?? [];
}

/**
 * One of the three records, which are always all there.
 */
function recordAt(
  records: readonly SimDynamoDbStreamRecord[],
  position: number,
): SimDynamoDbStreamRecord {
  const record = records.at(position);
  assertDefined(record, "DynamoDB stream record");

  return record;
}

describe("DynamoDB stream view types", () => {
  it("carries only the keys under KEYS_ONLY", async () => {
    // When an insertion, a modification and a removal go onto a KEYS_ONLY
    // stream.
    const records = await recordsUnder("KEYS_ONLY");

    // Then each says which item changed and how, and nothing else.
    for (const position of [0, 1, 2]) {
      const record = recordAt(records, position);
      assertObjectEquals(record.keys.toAttributeValues(), {
        orderId: { S: "order-1" },
      });
      assertUndefined(record.newImage);
      assertUndefined(record.oldImage);
      assertIdentical(record.streamViewType, "KEYS_ONLY");
    }
  });

  it("carries the item as it is now under NEW_IMAGE", async () => {
    // When the three changes go onto a NEW_IMAGE stream.
    const records = await recordsUnder("NEW_IMAGE");

    // Then the insertion and the modification carry what the item became.
    assertObjectEquals(recordAt(records, 0).newImage?.toAttributeValues(), {
      orderId: { S: "order-1" },
      total: { N: "101" },
    });
    assertObjectEquals(recordAt(records, 1).newImage?.toAttributeValues(), {
      orderId: { S: "order-1" },
      total: { N: "202" },
    });

    // And the removal is keys only, since a removed item has nothing it is
    // now. The record is still written: it is how a reader learns the item
    // has gone.
    const removal = recordAt(records, 2);
    assertIdentical(removal.eventName, "REMOVE");
    assertUndefined(removal.newImage);
    assertUndefined(removal.oldImage);
    assertObjectEquals(removal.keys.toAttributeValues(), {
      orderId: { S: "order-1" },
    });
  });

  it("carries the item as it was under OLD_IMAGE", async () => {
    // When the three changes go onto an OLD_IMAGE stream.
    const records = await recordsUnder("OLD_IMAGE");

    // Then the insertion is keys only, since an inserted item was nothing
    // before.
    const insertion = recordAt(records, 0);
    assertIdentical(insertion.eventName, "INSERT");
    assertUndefined(insertion.oldImage);
    assertUndefined(insertion.newImage);

    // And the modification and the removal carry what the item was.
    assertObjectEquals(recordAt(records, 1).oldImage?.toAttributeValues(), {
      orderId: { S: "order-1" },
      total: { N: "101" },
    });
    assertObjectEquals(recordAt(records, 2).oldImage?.toAttributeValues(), {
      orderId: { S: "order-1" },
      total: { N: "202" },
    });
    assertUndefined(recordAt(records, 1).newImage);
  });

  it("carries both images under NEW_AND_OLD_IMAGES", async () => {
    // When the three changes go onto a NEW_AND_OLD_IMAGES stream.
    const records = await recordsUnder("NEW_AND_OLD_IMAGES");

    // Then each record carries whichever images its change has.
    assertUndefined(recordAt(records, 0).oldImage);
    assertDefined(recordAt(records, 0).newImage, "new image");
    assertDefined(recordAt(records, 1).oldImage, "old image");
    assertDefined(recordAt(records, 1).newImage, "new image");
    assertObjectEquals(recordAt(records, 2).oldImage?.toAttributeValues(), {
      orderId: { S: "order-1" },
      total: { N: "202" },
    });
    assertUndefined(recordAt(records, 2).newImage);
  });
});

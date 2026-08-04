import { DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbStreamRecord } from "./sim-dynamodb-stream-record.js";
import { simDynamoDbStreamRecordSize } from "./sim-dynamodb-stream-record-size.js";

/**
 * The table AWS's own published stream records were written against: a Number
 * partition key named `Id`, and a String `Message` alongside it.
 */
async function messageTable(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().createTable({
    input: {
      TableName: "messages",
      KeySchema: [{ AttributeName: "Id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "Id", AttributeType: "N" }],
      BillingMode: "PAY_PER_REQUEST",
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    },
  });
  await simAws.backgroundTasksComplete();
}

/**
 * Write a message under the key AWS's samples use.
 */
async function putMessage(simAws: SimAws, message: string): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "messages",
      Item: { Id: { N: "101" }, Message: { S: message } },
    }),
  );
}

/**
 * The three records AWS publishes as a worked example of a table's stream.
 */
async function publishedRecords(): Promise<readonly SimDynamoDbStreamRecord[]> {
  const simAws = new SimAws();
  await messageTable(simAws);

  await putMessage(simAws, "New item!");
  await putMessage(simAws, "This item has changed");
  await simAws.dynamoDb().deleteItem(
    new DeleteItemCommand({
      TableName: "messages",
      Key: { Id: { N: "101" } },
    }),
  );

  const table = simAws.dynamoDb().findTable("messages");
  assertDefined(table, "messages table");

  return table.stream.latest?.records ?? [];
}

describe("DynamoDB stream record size", () => {
  it("measures AWS's own published records exactly", async () => {
    // When the three changes AWS publishes as a worked example are made.
    const records = await publishedRecords();

    // Then each record is the size AWS reports for it: the keys plus every
    // image the record carries, counted as the text each value is written as.
    assertIdentical(records[0]?.sizeBytes, 26);
    assertIdentical(records[1]?.sizeBytes, 59);
    assertIdentical(records[2]?.sizeBytes, 38);
  });

  it("counts a number as its digits, unlike the item size rule", () => {
    // Given an item carrying an eight digit number.
    const item = SimDynamoDbItem.fromAttributeValues({
      n: { N: "12345678" },
    });

    // Then the stream counts the name and every digit, where the 400 KB item
    // rule counts a number as roughly half its digits. The two agree on AWS's
    // published samples only because `101` is three characters either way.
    assertIdentical(simDynamoDbStreamRecordSize([item]), 9);
    assertIdentical(item.sizeInBytes(), 6);
  });
});

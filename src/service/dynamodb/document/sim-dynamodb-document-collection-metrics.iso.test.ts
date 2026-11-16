import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { simDynamoDbLocallyIndexedTableFactory } from "../secondary-index/sim-dynamodb-locally-indexed-table.factory.js";

/**
 * An intercepted document client over a table with a local secondary index.
 */
async function documentsOverIndexedTable(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  await simDynamoDbLocallyIndexedTableFactory.make({}, simSdk.simAws);

  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: simSdk.simAws.defaultRegionName }),
  );
  simSdk.intercept(documents);

  return documents;
}

describe("simulated DynamoDB document client item collection metrics", () => {
  it("answers a put with the collection key as plain values", async () => {
    // Given an intercepted document client over a locally indexed table.
    using simSdk = new SimSdk();
    const documents = await documentsOverIndexedTable(simSdk);

    // When an order is put, asking for the collection size.
    const output = await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { customerId: "customer-9", orderId: "order-9" },
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then the key comes back as plain JavaScript.
    assertObjectEquals(output.ItemCollectionMetrics, {
      ItemCollectionKey: { customerId: "customer-9" },
      SizeEstimateRangeGB: [0, 1],
    });
  });

  it("answers a batch write with each table's keys as plain values", async () => {
    // Given an intercepted document client over a locally indexed table.
    using simSdk = new SimSdk();
    const documents = await documentsOverIndexedTable(simSdk);

    // When a batch puts an order, asking for the collection sizes.
    const output = await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          OrdersTable: [
            {
              PutRequest: {
                Item: { customerId: "customer-9", orderId: "order-9" },
              },
            },
          ],
        },
        ReturnItemCollectionMetrics: "SIZE",
      }),
    );

    // Then the key comes back as plain JavaScript.
    assertObjectEquals(output.ItemCollectionMetrics, {
      OrdersTable: [
        {
          ItemCollectionKey: { customerId: "customer-9" },
          SizeEstimateRangeGB: [0, 1],
        },
      ],
    });
  });
});

import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbProjectionType } from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { simDynamoDbIndexProjectionInput } from "./sim-dynamodb-index-projection-input.js";
import { simDynamoDbLocallyIndexedOrders } from "./sim-dynamodb-locally-indexed-orders.js";

/**
 * What a test asks for when it wants a table with a local secondary index.
 *
 * The projection is the input because it is what a read of a local secondary
 * index turns on: which attributes come back by default, and which of them the
 * read has to reach the base table for.
 */
export interface SimDynamoDbLocallyIndexedTableInput {
  readonly tableName: string;
  readonly indexName: string;
  readonly projectionType: SimDynamoDbProjectionType;
  readonly nonKeyAttributes: readonly string[];
}

/**
 * Creates a table with one local secondary index, holding orders to read.
 *
 * The table is keyed by `customerId` and `orderId`, and the index re-sorts each
 * customer's orders by `placedAt`. One order per customer carries no
 * `placedAt`, which is what makes the index sparse rather than a second copy of
 * the table.
 *
 * ```typescript
 * const table = await simDynamoDbLocallyIndexedTableFactory.make(
 *   { projectionType: "KEYS_ONLY" },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbLocallyIndexedTableFactory = new AsyncMappedFactory<
  SimDynamoDbLocallyIndexedTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "OrdersTable",
    indexName: "byPlacedAt",
    projectionType: "ALL",
    nonKeyAttributes: [],
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "placedAt", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        LocalSecondaryIndexes: [
          {
            IndexName: input.indexName,
            KeySchema: [
              { AttributeName: "customerId", KeyType: "HASH" },
              { AttributeName: "placedAt", KeyType: "RANGE" },
            ],
            Projection: simDynamoDbIndexProjectionInput(input),
          },
        ],
      },
    });
    await simAws.backgroundTasksComplete();

    await Promise.all(
      simDynamoDbLocallyIndexedOrders().map(async (order) =>
        simDynamoDb.putItem({
          input: { TableName: input.tableName, Item: order },
        }),
      ),
    );

    const table = simDynamoDb.findTable(input.tableName);
    assertDefined(
      table,
      `Simulated DynamoDB created the table ${input.tableName} and then did ` +
        `not hold it`,
    );

    return table;
  },
);

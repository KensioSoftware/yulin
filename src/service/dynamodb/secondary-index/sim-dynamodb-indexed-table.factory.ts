import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbProjectionType } from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { simDynamoDbIndexedOrders } from "./sim-dynamodb-indexed-orders.js";

/**
 * What a test asks for when it wants a table with an index to read.
 *
 * The projection is the input because it is what makes reads of one index
 * differ from another: which attributes come back, and which `Select` values
 * and filters the index can answer.
 */
export interface SimDynamoDbIndexedTableInput {
  readonly tableName: string;
  readonly indexName: string;
  readonly projectionType: SimDynamoDbProjectionType;
  readonly nonKeyAttributes: readonly string[];
  readonly orderCount: number;
}

/**
 * Creates a table with one global secondary index, holding orders to read.
 *
 * The table is keyed by `orderId` and the index by `status` and `shippedAt`, so
 * a read of the index walks a key the table does not have. Every third order is
 * written without a `status`, which is what makes the index sparse rather than
 * a second copy of the table.
 *
 * ```typescript
 * const table = await simDynamoDbIndexedTableFactory.make(
 *   { projectionType: "KEYS_ONLY" },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbIndexedTableFactory = new AsyncMappedFactory<
  SimDynamoDbIndexedTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "OrdersTable",
    indexName: "byStatus",
    projectionType: "ALL",
    nonKeyAttributes: [],
    orderCount: 6,
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
          { AttributeName: "shippedAt", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: input.indexName,
            KeySchema: [
              { AttributeName: "status", KeyType: "HASH" },
              { AttributeName: "shippedAt", KeyType: "RANGE" },
            ],
            Projection: projection(input),
          },
        ],
      },
    });
    await simAws.backgroundTasksComplete();

    await Promise.all(
      simDynamoDbIndexedOrders(input.orderCount).map(async (order) =>
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

/**
 * The Projection the index is created with, which INCLUDE alone names
 * attributes for.
 */
function projection(input: SimDynamoDbIndexedTableInput): {
  readonly ProjectionType: SimDynamoDbProjectionType;
  readonly NonKeyAttributes?: readonly string[];
} {
  if (input.projectionType !== "INCLUDE") {
    return { ProjectionType: input.projectionType };
  }

  return {
    ProjectionType: input.projectionType,
    NonKeyAttributes: input.nonKeyAttributes,
  };
}

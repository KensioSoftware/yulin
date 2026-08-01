import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbScalarAttributeType } from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table whose items form collections.
 */
export interface SimDynamoDbCollectionTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;
  readonly sortKeyName: string;
  readonly sortKeyType: SimDynamoDbScalarAttributeType;
}

/**
 * Creates a table with both a partition key and a sort key, through CreateTable.
 *
 * A sort key is what makes several items one item collection, so this is the
 * table a Query reads. Use `simDynamoDbCreatedTableFactory` for a table keyed
 * by partition key alone, which holds at most one item under each key.
 *
 * The table is ACTIVE by the time this answers, the same way it is there.
 *
 * ```typescript
 * const table = await simDynamoDbCollectionTableFactory.make(
 *   { tableName: "OrdersTable", partitionKeyName: "customerId" },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbCollectionTableFactory = new AsyncMappedFactory<
  SimDynamoDbCollectionTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "OrdersTable",
    partitionKeyName: "customerId",
    sortKeyName: "orderId",
    sortKeyType: "S",
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [
          { AttributeName: input.partitionKeyName, KeyType: "HASH" },
          { AttributeName: input.sortKeyName, KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: input.partitionKeyName, AttributeType: "S" },
          {
            AttributeName: input.sortKeyName,
            AttributeType: input.sortKeyType,
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    });
    await simAws.backgroundTasksComplete();

    // A name CreateTable accepted is a table the store holds, so this is only
    // missing if something is wrong with the simulator itself.
    const table = simDynamoDb.findTable(input.tableName);
    assertDefined(
      table,
      `Simulated DynamoDB created the table ${input.tableName} and then did ` +
        `not hold it`,
    );

    return table;
  },
);

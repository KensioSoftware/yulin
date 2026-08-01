import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimDynamoDbBillingMode,
  SimDynamoDbScalarAttributeType,
} from "../command/table/table.types.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table to work on.
 *
 * A table is mostly its name and its key, and the rest of a CreateTable request
 * is the same every time. Naming the key as one attribute rather than as a key
 * schema and a matching attribute definition is what makes a table one line
 * here.
 */
export interface SimDynamoDbCreatedTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;
  readonly partitionKeyType: SimDynamoDbScalarAttributeType;
  readonly billingMode: SimDynamoDbBillingMode;
}

/**
 * Creates a table a simulated DynamoDB knows about, through CreateTable.
 *
 * This is the table an application would have: it went through the ordinary
 * command, so it was checked the way a real request is checked. Use
 * `simDynamoDbTableFactory` instead for a table on its own, with no simulated
 * DynamoDB holding it.
 *
 * The table is ACTIVE by the time this answers. Creating one schedules its
 * activation, and a test that has just asked for a table is asking for one it
 * can write to, so the scheduled work is drained here rather than in every
 * caller.
 *
 * ```typescript
 * const table = await simDynamoDbCreatedTableFactory.make(
 *   { tableName: "OrdersTable", partitionKeyName: "orderId" },
 *   simAws,
 * );
 * ```
 *
 * The table is created in the default Account and Region of the simulated AWS
 * it is given. A test working in another scope calls CreateTable itself.
 */
export const simDynamoDbCreatedTableFactory = new AsyncMappedFactory<
  SimDynamoDbCreatedTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "FoobarTable",
    partitionKeyName: "id",
    partitionKeyType: "S",
    billingMode: "PAY_PER_REQUEST",
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [{ AttributeName: input.partitionKeyName, KeyType: "HASH" }],
        AttributeDefinitions: [
          {
            AttributeName: input.partitionKeyName,
            AttributeType: input.partitionKeyType,
          },
        ],
        BillingMode: input.billingMode,
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

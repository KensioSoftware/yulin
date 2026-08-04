import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table that captures its changes.
 */
export interface SimDynamoDbStreamedTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;

  /**
   * Which images the stream's records carry.
   */
  readonly viewType: SimDynamoDbStreamViewType;
}

/**
 * Creates a table with a stream already switched on, through CreateTable.
 *
 * The table went through the ordinary command, so it is the table an
 * application would have rather than one built around the commands, and it is
 * ACTIVE by the time this answers.
 *
 * ```typescript
 * const table = await simDynamoDbStreamedTableFactory.make(
 *   { tableName: "orders", viewType: "NEW_AND_OLD_IMAGES" },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbStreamedTableFactory = new AsyncMappedFactory<
  SimDynamoDbStreamedTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "orders",
    partitionKeyName: "orderId",
    viewType: "NEW_AND_OLD_IMAGES",
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable({
      input: {
        TableName: input.tableName,
        KeySchema: [{ AttributeName: input.partitionKeyName, KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: input.partitionKeyName, AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        StreamSpecification: {
          StreamEnabled: true,
          StreamViewType: input.viewType,
        },
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

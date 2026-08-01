import { AsyncMappedFactory } from "@kensio/part-factory";
import type { SimAws } from "../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table that expires its items.
 */
export interface SimDynamoDbExpiringTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;

  /**
   * The attribute items expire by, holding epoch seconds in a Number.
   */
  readonly attributeName: string;
}

/**
 * Creates a table with time to live already switched on.
 *
 * The table went through CreateTable and UpdateTimeToLive, so it is the table
 * an application would have rather than one built around the commands. Both
 * have settled by the time this answers: a test asking for an expiring table is
 * asking for one that is already ENABLED.
 *
 * ```typescript
 * const table = await simDynamoDbExpiringTableFactory.make(
 *   { tableName: "Sessions", attributeName: "expiresAt" },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbExpiringTableFactory = new AsyncMappedFactory<
  SimDynamoDbExpiringTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "Sessions",
    partitionKeyName: "sessionId",
    attributeName: "expiresAt",
  }),
  async (input, simAws) => {
    const table = await simDynamoDbCreatedTableFactory.make(
      {
        tableName: input.tableName,
        partitionKeyName: input.partitionKeyName,
      },
      simAws,
    );

    await simAws.dynamoDb().updateTimeToLive({
      input: {
        TableName: input.tableName,
        TimeToLiveSpecification: {
          Enabled: true,
          AttributeName: input.attributeName,
        },
      },
    });
    await simAws.backgroundTasksComplete();

    return table;
  },
);

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { assertNonNullable } from "@kensio/smartass";
import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimDynamoDbTable } from "../../src/service/dynamodb/table/sim-dynamodb-table.js";

/**
 * What the pipeline asks for when it wants somewhere to record uploads.
 *
 * Naming the two keys as attributes rather than as a key schema and matching
 * attribute definitions is what makes the table three lines here.
 */
export interface MediaUploadsTableInput {
  readonly tableName: string;
  readonly partitionKeyName: string;
  readonly sortKeyName: string;
}

/**
 * Creates the Table the pipeline records an upload's progress in, through
 * CreateTable.
 *
 * A user's uploads sit together under their own partition key, so one upload
 * is one item and a user's uploads are one query.
 *
 * ```typescript
 * const table = await mediaUploadsTableFactory.make({}, simAws);
 * ```
 *
 * The table is ACTIVE by the time this answers, because a caller that has just
 * asked for a table is asking for one it can write to.
 *
 * `simDynamoDbCreatedTableFactory` covers a table with a partition key alone.
 * This one exists because the pipeline's table has a sort key, and that
 * factory deliberately has no branch for one.
 */
export const mediaUploadsTableFactory = new AsyncMappedFactory<
  MediaUploadsTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "ImageUploads",
    partitionKeyName: "userId",
    sortKeyName: "uploadId",
  }),
  async (input, simAws) => {
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: input.tableName,
        KeySchema: [
          { AttributeName: input.partitionKeyName, KeyType: "HASH" },
          { AttributeName: input.sortKeyName, KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: input.partitionKeyName, AttributeType: "S" },
          { AttributeName: input.sortKeyName, AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // Creation schedules activation, and the pipeline writes to the table.
    await simAws.backgroundTasksComplete();

    const table = simDynamoDb.findTable(input.tableName);
    assertNonNullable(table, `Simulated DynamoDB holds ${input.tableName}`);

    return table;
  },
);

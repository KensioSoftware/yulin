import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type {
  SimQueryCommandInput,
  SimQueryCommandOutput,
} from "../query/query.command.js";
import type { SimScanCommandInput } from "../scan/scan.command.js";

/**
 * Test support for checking one rule on both of the operations it governs.
 *
 * `Select`, `ProjectionExpression` and the rest of the read parameters mean the
 * same thing to a Query and to a Scan, and a rule proved on one of them says
 * nothing about the other. Tests of those iterate this rather than being
 * written twice.
 *
 * These helpers drive the simulator through structural command shapes rather
 * than real SDK command objects, because this is source rather than a test
 * file. The colocated tests cover SDK-shaped input.
 */

/**
 * The values a query's own key condition needs, whatever the test adds.
 */
const keyConditionValues = { ":customer": { S: "c-1" } };

/**
 * One way of reading a table, against `simDynamoDbStockedTableFactory`.
 *
 * A query carries a key condition of its own, so what a test writes is added to
 * that rather than replacing it.
 */
export interface SimDynamoDbTableRead {
  readonly operation: string;
  readonly read: (
    simDynamoDb: SimDynamoDb,
    input: SimQueryCommandInput & SimScanCommandInput,
  ) => Promise<SimQueryCommandOutput>;
}

/**
 * Every way of reading a table, for a test that iterates them.
 */
export const simDynamoDbTableReads: readonly SimDynamoDbTableRead[] = [
  {
    operation: "Query",
    read: async (simDynamoDb, input) =>
      simDynamoDb.query({
        input: {
          TableName: "OrdersTable",
          KeyConditionExpression: "customerId = :customer",
          ...input,
          ExpressionAttributeValues: {
            ...keyConditionValues,
            ...input.ExpressionAttributeValues,
          },
        },
      }),
  },
  {
    operation: "Scan",
    read: async (simDynamoDb, input) =>
      simDynamoDb.scan({ input: { TableName: "OrdersTable", ...input } }),
  },
];

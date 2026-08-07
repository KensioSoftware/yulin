import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * Create the named tables, all at once, as an application might.
 */
async function createTables(
  simDynamoDb: SimDynamoDb,
  names: readonly string[],
): Promise<void> {
  await Promise.all(
    names.map(async (name) =>
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: name,
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
      ),
    ),
  );
}

describe("DynamoDB ListTablesCommand", () => {
  it("lists every table in order, with no token on the last page", async () => {
    // Given tables created out of order.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await createTables(simDynamoDb, ["TableC", "TableA", "TableB"]);

    // When the tables are listed.
    const listing = await simDynamoDb.listTables(new ListTablesCommand());

    // Then they come back in name order, and nothing says there is more.
    assertArrayEquals(listing.TableNames, ["TableA", "TableB", "TableC"]);
    assertUndefined(listing.LastEvaluatedTableName);

    await simAws.backgroundTasksComplete();
  });

  it("pages through the tables until the token runs out", async () => {
    // Given more tables than one page holds.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await createTables(simDynamoDb, ["TableA", "TableB", "TableC"]);

    // When a caller loops until there is no token left.
    const listed: string[] = [];
    let startAfter: string | undefined;
    let pages = 0;

    do {
      // oxlint-disable-next-line no-await-in-loop -- a page at a time is the point.
      const page = await simDynamoDb.listTables(
        new ListTablesCommand({
          Limit: 2,
          ExclusiveStartTableName: startAfter,
        }),
      );
      listed.push(...(page.TableNames ?? []));
      startAfter = page.LastEvaluatedTableName;
      pages += 1;
    } while (startAfter !== undefined);

    // Then the loop ends, having seen every table once.
    assertArrayEquals(listed, ["TableA", "TableB", "TableC"]);
    assertIdentical(pages, 2);

    await simAws.backgroundTasksComplete();
  });

  it("resumes at the first name after the one it is given", async () => {
    // Given three tables.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();
    await createTables(simDynamoDb, ["TableA", "TableB", "TableC"]);

    // When a page resumes from a name no table has, as a token for a table
    // deleted since the last page would be.
    const listing = await simDynamoDb.listTables(
      new ListTablesCommand({ ExclusiveStartTableName: "TableAA" }),
    );

    // Then it carries on from the first name after it.
    assertArrayEquals(listing.TableNames, ["TableB", "TableC"]);

    await simAws.backgroundTasksComplete();
  });

  it("refuses a limit outside the range DynamoDB takes", async () => {
    // Given a simulated DynamoDB.
    const simDynamoDb = new SimAws().dynamoDb();

    // When a page of no tables, or of more than a hundred, is asked for.
    const noTables = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTables(new ListTablesCommand({ Limit: 0 })),
    );
    const tooMany = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTables(new ListTablesCommand({ Limit: 101 })),
    );

    // Then both are refused.
    assertInstanceOf(noTables, SimDynamoDbValidationException);
    assertStringIncludes(noTables.message, "Limit 0 is invalid");
    assertInstanceOf(tooMany, SimDynamoDbValidationException);
    assertStringIncludes(tooMany.message, "Limit 101 is invalid");
  });

  it("lists nothing when there are no tables", async () => {
    // Given a simulated DynamoDB with no tables.
    const simDynamoDb = new SimAws().dynamoDb();

    // When the tables are listed.
    const listing = await simDynamoDb.listTables(new ListTablesCommand());

    // Then the list is empty and there is nothing to resume from.
    assertArrayEquals(listing.TableNames, []);
    assertUndefined(listing.LastEvaluatedTableName);
  });
});

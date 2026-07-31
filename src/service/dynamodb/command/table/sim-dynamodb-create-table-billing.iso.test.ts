import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";

const keyInput = {
  TableName: "FoobarTable",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
} as const satisfies SimCreateTableCommandInput;

/**
 * Create a table with billing input real DynamoDB would refuse.
 */
async function refusedCreateTable(
  input: SimCreateTableCommandInput,
): Promise<Error> {
  const simDynamoDb = new SimAws().dynamoDb();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.createTable({ input }),
  );
}

describe("DynamoDB CreateTableCommand billing", () => {
  it("refuses a provisioned table with no throughput", async () => {
    // When a table is created with no billing mode and no throughput, which
    // leaves it provisioned with nothing provisioned.
    const error = await refusedCreateTable(keyInput);

    // Then the missing throughput is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ReadCapacityUnits and WriteCapacityUnits must both be specified when " +
        "BillingMode is PROVISIONED",
    );
  });

  it("refuses an on-demand table with throughput", async () => {
    // When a table is created on demand with capacity to provision.
    const error = await refusedCreateTable({
      ...keyInput,
      BillingMode: "PAY_PER_REQUEST",
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    });

    // Then the contradiction is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Neither ReadCapacityUnits nor WriteCapacityUnits can be specified " +
        "when BillingMode is PAY_PER_REQUEST",
    );
  });

  it("refuses read capacity below one", async () => {
    // When a table is created with no read capacity.
    const error = await refusedCreateTable({
      ...keyInput,
      ProvisionedThroughput: { ReadCapacityUnits: 0, WriteCapacityUnits: 1 },
    });

    // Then the read capacity is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ReadCapacityUnits must be at least 1");
  });

  it("refuses write capacity below one", async () => {
    // When a table is created with no write capacity.
    const error = await refusedCreateTable({
      ...keyInput,
      ProvisionedThroughput: { ReadCapacityUnits: 1 },
    });

    // Then the write capacity is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "WriteCapacityUnits must be at least 1",
    );
  });

  it("refuses capacity that is not a whole number of units", async () => {
    // When a table is created with a capacity that is not a number of units.
    const error = await refusedCreateTable({
      ...keyInput,
      ProvisionedThroughput: {
        ReadCapacityUnits: NaN,
        WriteCapacityUnits: 1,
      },
    });

    // Then it is refused, rather than stored as the table's capacity.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ReadCapacityUnits must be at least 1");
  });

  it("refuses a billing mode that is neither of the two", async () => {
    // When a table is created with a billing mode DynamoDB has no such thing as.
    const error = await refusedCreateTable({
      ...keyInput,
      BillingMode: "FREE",
    });

    // Then the billing mode is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "BillingMode 'FREE' is invalid");
  });

  it("refuses a table class that is neither of the two", async () => {
    // When a table is created with a table class DynamoDB has no such thing as.
    const error = await refusedCreateTable({
      ...keyInput,
      BillingMode: "PAY_PER_REQUEST",
      TableClass: "GLACIER",
    });

    // Then the table class is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "TableClass 'GLACIER' is invalid");
  });

  it("reports the billing mode a provisioned table named", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table names PROVISIONED billing and provisions capacity for it.
    const creation = await simAws.dynamoDb().createTable({
      input: {
        ...keyInput,
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 10,
        },
      },
    });

    // Then the billing mode comes back with the table.
    assertStringIncludes(
      creation.TableDescription?.BillingModeSummary?.BillingMode ?? "",
      "PROVISIONED",
    );

    await simAws.backgroundTasksComplete();
  });
});

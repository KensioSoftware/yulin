import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";

/**
 * Create a table with input real DynamoDB would refuse, and read the refusal.
 */
async function refusedCreateTable(
  input: SimCreateTableCommandInput,
): Promise<Error> {
  const simDynamoDb = new SimAws().dynamoDb();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.createTable({ input }),
  );
}

describe("DynamoDB CreateTableCommand validation", () => {
  it("requires a table name", async () => {
    // When a table is created with no name.
    const error = await refusedCreateTable({
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the missing name is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A TableName is required");
  });

  it("refuses a table name real DynamoDB would refuse", async () => {
    // When a table is created with a name holding a character AWS disallows.
    const error = await refusedCreateTable({
      TableName: "Foobar Table",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the name is reported as invalid.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "TableName 'Foobar Table' is invalid");
  });

  it("requires a key schema", async () => {
    // When a table is created with no key schema.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the missing key schema is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A KeySchema with a HASH key element");
  });

  it("refuses an empty key schema", async () => {
    // When a table is created with an empty key schema.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the missing key schema is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A KeySchema with a HASH key element");
  });

  it("refuses a key schema with a RANGE key first", async () => {
    // When a table is created with its sort key ahead of its partition key.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [
        { AttributeName: "sk", KeyType: "RANGE" },
        { AttributeName: "pk", KeyType: "HASH" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the element in the wrong position is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "KeySchema element 1 is not a HASH key type",
    );
  });

  it("refuses a key schema with more than two elements", async () => {
    // When a table is created with three key schema elements.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
        { AttributeName: "extra", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the extra element is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "3 elements were given");
  });

  it("refuses a key schema element with no attribute name", async () => {
    // When a table is created with a nameless key attribute.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [{ KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the nameless element is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "the HASH key element has no AttributeName",
    );
  });

  it("refuses a key schema whose two keys name one attribute", async () => {
    // When a table is created with the same attribute as both keys.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [
        { AttributeName: "id", KeyType: "HASH" },
        { AttributeName: "id", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the repeated attribute is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "both name the attribute id");
  });

  it("requires attribute definitions", async () => {
    // When a table is created with no attribute definitions, as the README
    // example used to.
    const simDynamoDb = new SimAws().dynamoDb();
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: "FoobarTable",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
      ),
    );

    // Then the missing definitions are reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "An AttributeDefinitions entry is required",
    );
  });

  it("refuses an attribute definition with no name", async () => {
    // When a table is created with a nameless attribute definition.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the nameless definition is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "has no AttributeName");
  });

  it("refuses an attribute type that is not S, N or B", async () => {
    // When a table is created with a boolean key attribute.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "BOOL" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the attribute type is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "AttributeType 'BOOL'");
  });

  it("refuses an attribute defined twice", async () => {
    // When a table is created with the same attribute defined twice.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "id", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the repeated definition is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "more than once");
  });

  it("refuses a key attribute with no definition", async () => {
    // When a table is created with a sort key nothing defines.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the undefined key attribute is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The KeySchema names the attribute sk, which has no AttributeDefinition",
    );
  });

  it("refuses an attribute definition no key uses", async () => {
    // When a table is created with an attribute defined outside its keys.
    const error = await refusedCreateTable({
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "email", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    });

    // Then the unused definition is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "defines the attribute email, which no key uses",
    );
  });
});

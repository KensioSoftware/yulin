import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";
import type { SimDynamoDbSecondaryIndexInput } from "./table.types.js";

/**
 * An index the request is otherwise happy with, for a test changing one part.
 */
const byStatus: SimDynamoDbSecondaryIndexInput = {
  IndexName: "byStatus",
  KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
  Projection: { ProjectionType: "KEYS_ONLY" },
};

/**
 * Create a table with index input real DynamoDB would refuse.
 */
async function refusedIndexes(
  indexes: readonly SimDynamoDbSecondaryIndexInput[],
  overrides: Partial<SimCreateTableCommandInput> = {},
): Promise<Error> {
  const simDynamoDb = new SimAws().dynamoDb();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.createTable({
      input: {
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        ...overrides,
        GlobalSecondaryIndexes: indexes,
      },
    }),
  );
}

describe("DynamoDB CreateTableCommand index validation", () => {
  it("requires an index name", async () => {
    // When an index is declared with no name.
    const error = await refusedIndexes([{ ...byStatus, IndexName: undefined }]);

    // Then the missing name is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A secondary index has no IndexName");
  });

  it("refuses an index name real DynamoDB would refuse", async () => {
    // When an index is declared with a name holding a character AWS disallows.
    const error = await refusedIndexes([
      { ...byStatus, IndexName: "by Status" },
    ]);

    // Then the name is reported as invalid.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "IndexName 'by Status' is invalid");
  });

  it("refuses two indexes sharing a name", async () => {
    // When a table is created with the same index name twice.
    const error = await refusedIndexes([
      byStatus,
      { ...byStatus, Projection: { ProjectionType: "ALL" } },
    ]);

    // Then the repeated name is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "names an index more than once");
  });

  it("refuses more than twenty indexes", async () => {
    // When a table is created with twenty one indexes.
    const error = await refusedIndexes(
      Array.from({ length: 21 }, (_unused, position) => ({
        ...byStatus,
        IndexName: `byStatus${position.toString()}`,
      })),
    );

    // Then the count is reported rather than the twenty first index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "21 GlobalSecondaryIndexes were given");
  });

  it("refuses more than a hundred projected attributes in total", async () => {
    // Given six indexes, each keyed on an attribute of its own and each
    // projecting seventeen attributes, which is inside the twenty per index.
    const keyed = ["a", "b", "c", "d", "e", "f"];
    const indexes = keyed.map((attributeName) => ({
      IndexName: `by${attributeName}`,
      KeySchema: [{ AttributeName: attributeName, KeyType: "HASH" }],
      Projection: {
        ProjectionType: "INCLUDE",
        NonKeyAttributes: Array.from(
          { length: 17 },
          (_unused, position) => `${attributeName}${position.toString()}`,
        ),
      },
    }));

    // When the table is created with all six.
    const error = await refusedIndexes(indexes, {
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        ...keyed.map((attributeName) => ({
          AttributeName: attributeName,
          AttributeType: "S",
        })),
      ],
    });

    // Then the total is reported rather than each index passing on its own.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "102 NonKeyAttributes are projected across the table's indexes",
    );
  });

  it("requires an index key schema", async () => {
    // When an index is declared with no key schema.
    const error = await refusedIndexes([{ ...byStatus, KeySchema: undefined }]);

    // Then the missing key schema names the index it belongs to.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "A KeySchema with a HASH key element is required for index byStatus",
    );
  });

  it("refuses an index key schema with a RANGE key first", async () => {
    // When an index is declared with its sort key ahead of its partition key.
    const error = await refusedIndexes([
      {
        ...byStatus,
        KeySchema: [
          { AttributeName: "updatedAt", KeyType: "RANGE" },
          { AttributeName: "status", KeyType: "HASH" },
        ],
      },
    ]);

    // Then the element in the wrong position is reported, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Invalid KeySchema for index byStatus: KeySchema element 1 is not a " +
        "HASH key type",
    );
  });

  it("refuses an index key schema with more than two elements", async () => {
    // When an index is declared with three key schema elements.
    const error = await refusedIndexes([
      {
        ...byStatus,
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "updatedAt", KeyType: "RANGE" },
          { AttributeName: "extra", KeyType: "RANGE" },
        ],
      },
    ]);

    // Then the extra element is reported, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Invalid KeySchema for index byStatus: a key schema holds a HASH " +
        "element and at most one RANGE element, but 3 elements were given",
    );
  });

  it("refuses an index whose two keys name one attribute", async () => {
    // When an index is declared with the same attribute as both its keys.
    const error = await refusedIndexes([
      {
        ...byStatus,
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "status", KeyType: "RANGE" },
        ],
      },
    ]);

    // Then the repeated attribute is reported, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Invalid KeySchema for index byStatus: the HASH and RANGE elements " +
        "both name the attribute status",
    );
  });

  it("refuses an index key attribute with no definition", async () => {
    // When an index is keyed on an attribute nothing defines.
    const error = await refusedIndexes([
      {
        ...byStatus,
        KeySchema: [{ AttributeName: "owner", KeyType: "HASH" }],
      },
    ]);

    // Then the undefined key attribute is reported, naming the index. This is
    // the rule CreateTable input goes wrong on most often.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The KeySchema for index byStatus names the attribute owner, which has " +
        "no AttributeDefinition",
    );
  });

  it("refuses an attribute defined for no key at all", async () => {
    // When a table declares an attribute neither it nor its index is keyed on.
    const error = await refusedIndexes([byStatus], {
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "owner", AttributeType: "S" },
      ],
    });

    // Then the unused definition is reported. An index key counts as a use, so
    // the check runs against every key schema the request carries.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "defines the attribute owner, which no key uses",
    );
  });

  it("refuses an index key attribute type that is not S, N or B", async () => {
    // When an index is keyed on a boolean attribute.
    const error = await refusedIndexes([byStatus], {
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "BOOL" },
      ],
    });

    // Then the attribute type is reported.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "AttributeType 'BOOL'");
  });

  it("requires an index throughput on a provisioned table", async () => {
    // When a provisioned table declares an index with no capacity of its own.
    const error = await refusedIndexes([byStatus], {
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 3 },
    });

    // Then the missing capacity is reported, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ProvisionedThroughput must be specified for index: byStatus",
    );
  });

  it("refuses an index throughput on an on-demand table", async () => {
    // When an on-demand table declares an index with capacity of its own.
    const error = await refusedIndexes([
      {
        ...byStatus,
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 3,
        },
      },
    ]);

    // Then the capacity is refused, naming the index.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ProvisionedThroughput cannot be specified for index: byStatus",
    );
  });

  it("refuses index capacity real DynamoDB would refuse", async () => {
    // When a provisioned index asks for no read capacity at all.
    const error = await refusedIndexes(
      [
        {
          ...byStatus,
          ProvisionedThroughput: { WriteCapacityUnits: 3 },
        },
      ],
      {
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 3 },
      },
    );

    // Then the capacity is held to the same rule the table's own is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ReadCapacityUnits must be at least 1");
  });
});

import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simCfnResourceFactory } from "../../../cloudformation/resource/sim-cfn-resource.factory.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimDynamoDbCfnResourceFactory } from "../sim-cfn-dynamodb-resource-factory.js";
import { simCfnDynamoDbTableResourceFactory } from "./sim-cfn-dynamodb-table-resource.factory.js";

/**
 * A table Resource with one property broken, which is what each of these tests
 * is about. Everything else comes from the factory, so a test states the
 * property it is breaking and nothing else.
 */
function tableBreaking(
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return simCfnDynamoDbTableResourceFactory.make({
    tableName: "orders",
    properties,
  });
}

/**
 * Create a table straight through the Resource factory, returning whatever it
 * rejects with. Keeps the property reading under test without a whole stack.
 */
async function createTableResource(
  template: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const factory = new SimDynamoDbCfnResourceFactory({
    dynamoDb: simAws.dynamoDb(),
  });

  return await assertThrowsErrorAsync(async () => {
    return await factory.create(
      "Table",
      simCfnResourceFactory.make({ logicalId: "BadTable", template }),
      { simAws, resources: new Map() },
    );
  });
}

describe("AWS::DynamoDB::Table property reading", () => {
  it("refuses a TableName that is not a string", async () => {
    // Given a template carrying something other than a name as TableName.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(
      simCfnDynamoDbTableResourceFactory.make({
        properties: { TableName: 42 },
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: TableName must be a " +
        "string",
    );
  });

  it("refuses a KeySchema that is not a list", async () => {
    // Given a template carrying an object where the key schema list belongs.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(
      tableBreaking({ KeySchema: { AttributeName: "id", KeyType: "HASH" } }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: KeySchema must be a " +
        "list",
    );
  });

  it("refuses a KeySchema element that is not an object", async () => {
    // Given a template carrying a plain string where a key schema element
    // belongs.
    // When the Resource is created, then the refusal names the position.
    const error = await createTableResource(
      tableBreaking({ KeySchema: ["id"] }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: KeySchema.0 must be " +
        "an object",
    );
  });

  it("refuses a key schema attribute name that is not a string", async () => {
    // Given a template carrying a number where an attribute name belongs.
    // When the Resource is created, then the refusal names the property path.
    const error = await createTableResource(
      tableBreaking({ KeySchema: [{ AttributeName: 1, KeyType: "HASH" }] }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "KeySchema.0.AttributeName must be a string",
    );
  });

  it("refuses an attribute definition type that is not a string", async () => {
    // Given a template carrying a number where an attribute type belongs.
    // When the Resource is created, then the refusal names the property path.
    const error = await createTableResource(
      tableBreaking({
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: 3 }],
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "AttributeDefinitions.0.AttributeType must be a string",
    );
  });

  it("refuses a BillingMode that is not a string", async () => {
    // Given a template carrying a number where the billing mode belongs.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(tableBreaking({ BillingMode: 1 }));

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: BillingMode must be a " +
        "string",
    );
  });

  it("refuses a TableClass that is not a string", async () => {
    // Given a template carrying a list where the table class belongs.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(
      tableBreaking({ TableClass: ["STANDARD"] }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: TableClass must be a " +
        "string",
    );
  });

  it("refuses a ProvisionedThroughput that is not an object", async () => {
    // Given a template carrying a number where the throughput object belongs.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(
      tableBreaking({ ProvisionedThroughput: 5 }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "ProvisionedThroughput must be an object",
    );
  });

  it("refuses a capacity that is neither a number nor a number in a string", async () => {
    // Given a template carrying a word where a capacity belongs.
    // When the Resource is created, then it is refused rather than read as
    // nothing, which would look like a missing capacity instead.
    const error = await createTableResource(
      tableBreaking({
        ProvisionedThroughput: {
          ReadCapacityUnits: "plenty",
          WriteCapacityUnits: 1,
        },
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "ProvisionedThroughput.ReadCapacityUnits must be a number",
    );
  });

  it("refuses a blank capacity string", async () => {
    // Given a template carrying whitespace where a capacity belongs, which
    // Number() would otherwise read as zero.
    // When the Resource is created, then it is refused.
    const error = await createTableResource(
      tableBreaking({
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: "  ",
        },
      }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "ProvisionedThroughput.WriteCapacityUnits must be a number",
    );
  });

  it("refuses a DeletionProtectionEnabled value that is neither true nor false", async () => {
    // Given a template carrying something else as DeletionProtectionEnabled.
    // When the Resource is created, then it is refused rather than read as
    // false, since a table left unprotected is the wrong way to fail.
    const error = await createTableResource(
      tableBreaking({ DeletionProtectionEnabled: "yes" }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: " +
        "DeletionProtectionEnabled must be true or false",
    );
  });

  it("leaves a missing KeySchema for CreateTable to refuse", async () => {
    // Given a template with no KeySchema in it at all.
    // When the Resource is created, then the refusal is the one CreateTable
    // gives, rather than a second wording for the same missing property.
    // Written out rather than built, since the factory always gives a table a
    // key and this is the table without one.
    const error = await createTableResource({
      Type: "AWS::DynamoDB::Table",
      Properties: { TableName: "orders" },
    });

    assertStringIncludes(
      error.message,
      "A KeySchema with a HASH key element is required",
    );
  });

  it("leaves a half-filled ProvisionedThroughput for CreateTable to refuse", async () => {
    // Given a provisioned table naming a read capacity and no write capacity.
    // When the Resource is created, then CreateTable refuses the missing one.
    const error = await createTableResource(
      tableBreaking({
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: { ReadCapacityUnits: 5 },
      }),
    );

    assertStringIncludes(
      error.message,
      "WriteCapacityUnits must be at least 1 when BillingMode is PROVISIONED",
    );
  });

  it("refuses a property AWS::DynamoDB::Table does not have", async () => {
    // Given a template carrying a property that is not on the Resource type,
    // which real CloudFormation refuses too.
    // When the Resource is created, then it is refused rather than skipped:
    // nothing is missing from the simulation, the template is wrong.
    const error = await createTableResource(
      tableBreaking({ ReadCapacityUnits: 5 }),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::DynamoDB::Table Resource BadTable: ReadCapacityUnits is " +
        "not an AWS::DynamoDB::Table property",
    );
  });
});

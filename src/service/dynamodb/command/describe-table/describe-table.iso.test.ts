import { describe, it } from "vitest";
import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertOneOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";

describe("DynamoDB DescribeTableCommand", () => {
  it("describes DynamoDB Table", async () => {
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await Promise.all([
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: "TableA",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: "TableB",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDb.createTable(
        new CreateTableCommand({
          TableName: "TableC",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    ]);

    const describeTableOutput = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );

    assertNonNullable(describeTableOutput.Table?.TableName);
    assertIdentical(describeTableOutput.Table.TableName, "TableB");
    assertNonNullable(describeTableOutput.Table.TableStatus);
    assertOneOf(describeTableOutput.Table.TableStatus, ["CREATING", "ACTIVE"]);

    await simAws.backgroundTasksComplete();

    const describeAgain = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );
    assertNonNullable(describeAgain.Table?.TableStatus);
    assertIdentical(describeAgain.Table.TableStatus, "ACTIVE");
  });

  it("throws on undefined Table name", async () => {
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: undefined }),
      ),
    );
  });

  it("throws on describing non-existent DynamoDB Table", async () => {
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: "NonExistentTable" }),
      ),
    );
    assertInstanceOf(error, ResourceNotFoundException);
  });
});

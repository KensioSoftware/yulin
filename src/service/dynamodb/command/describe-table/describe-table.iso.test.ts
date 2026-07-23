import { describe, it } from "vitest";
import {
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertOneOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbResourceNotFoundException as SimDynamoDatabaseResourceNotFoundException } from "../../error/dynamodb.error.js";

describe("DynamoDB DescribeTableCommand", () => {
  it("describes DynamoDB Table", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await Promise.all([
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableA",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableB",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "TableC",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      ),
    ]);

    const describeTableOutput = await simDynamoDatabase.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );

    assertNonNullable(describeTableOutput.Table?.TableName);
    assertIdentical(describeTableOutput.Table.TableName, "TableB");
    assertNonNullable(describeTableOutput.Table.TableStatus);
    assertOneOf(describeTableOutput.Table.TableStatus, ["CREATING", "ACTIVE"]);

    await simAws.backgroundTasksComplete();

    const describeAgain = await simDynamoDatabase.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );
    assertNonNullable(describeAgain.Table?.TableStatus);
    assertIdentical(describeAgain.Table.TableStatus, "ACTIVE");
  });

  it("throws on undefined Table name", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await assertThrowsErrorAsync(async () =>
      simDynamoDatabase.describeTable(
        new DescribeTableCommand({ TableName: undefined }),
      ),
    );
  });

  it("throws on describing non-existent DynamoDB Table", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDatabase.describeTable(
        new DescribeTableCommand({ TableName: "NonExistentTable" }),
      ),
    );
    assertInstanceOf(error, SimDynamoDatabaseResourceNotFoundException);
  });
});

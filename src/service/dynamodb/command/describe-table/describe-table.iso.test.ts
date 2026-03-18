import { describe, it } from "vitest";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
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

describe("DynamoDB DescribeTableCommand", () => {
  it("describes DynamoDB Table", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await Promise.all([
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableA" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableB" })),
      simDynamoDb.createTable(new CreateTableCommand({ TableName: "TableC" })),
    ]);

    const describeTableOutput = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );

    assertNonNullable(describeTableOutput.Table?.TableName);
    assertIdentical(describeTableOutput.Table.TableName, "TableB");
    assertNonNullable(describeTableOutput.Table.TableStatus);
    assertOneOf(describeTableOutput.Table.TableStatus, ["CREATING", "ACTIVE"]);

    await simAccount.backgroundTasksComplete();

    const describeAgain = await simDynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "TableB" }),
    );
    assertNonNullable(describeAgain.Table?.TableStatus);
    assertIdentical(describeAgain.Table.TableStatus, "ACTIVE");
  });

  it("throws on undefined Table name", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: undefined }),
      ),
    );
  });

  it("throws on describing non-existent DynamoDB Table", async () => {
    const simAccount = new SimAwsAccount();
    const simDynamoDb = simAccount.getDynamoDb();

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.describeTable(
        new DescribeTableCommand({ TableName: "NonExistentTable" }),
      ),
    );
    assertInstanceOf(error, ResourceNotFoundException);
  });
});

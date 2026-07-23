import { describe, it } from "vitest";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

describe("simulated DynamoDB SDK Command routing", () => {
  it("round-trips Table Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const tableCreation = await client.send(
      new CreateTableCommand({
        TableName: "InterceptTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      }),
    );
    assertIdentical(
      tableCreation.TableDescription?.TableName,
      "InterceptTable",
    );
    await simSdk.simAws.backgroundTasksComplete();

    const describeOut = await client.send(
      new DescribeTableCommand({ TableName: "InterceptTable" }),
    );
    assertIdentical(describeOut.Table?.TableStatus, "ACTIVE");

    const listOut = await client.send(new ListTablesCommand({}));
    assertIdentical(listOut.TableNames?.[0], "InterceptTable");

    // And the intercepted Table is in the client Region's simulated scope.
    const directListOut = await simSdk.simAws
      .region("eu-west-2")
      .dynamoDb()
      .listTables(new ListTablesCommand({}));
    assertIdentical(directListOut.TableNames?.[0], "InterceptTable");
  });

  it("routes PutItemCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateTableCommand({
        TableName: "ItemTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    const putOut = await client.send(
      new PutItemCommand({
        TableName: "ItemTable",
        Item: { id: { S: "item-1" }, name: { S: "First item" } },
      }),
    );

    assertNonNullable(putOut.$metadata);
  });

  it("rejects a Command simulated DynamoDB does not support", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new GetItemCommand({
          TableName: "InterceptTable",
          Key: { id: { S: "item-1" } },
        }),
      );
    });

    assertStringIncludes(error.message, "GetItemCommand");
    assertStringIncludes(error.message, "PutItemCommand");
  });
});

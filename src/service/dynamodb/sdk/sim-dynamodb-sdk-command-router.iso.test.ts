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
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

describe("simulated DynamoDB SDK Command routing", () => {
  it("round-trips Table Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const tableCreation = await client.send(
      new CreateTableCommand({
        TableName: "InterceptTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
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
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
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

  it("does not give a denied run-as caller root privileges", async () => {
    using simSdk = new SimSdk();
    const accountId = simSdk.simAws.defaultAccountId;
    const client = new DynamoDBClient({ region: "us-east-1" });
    simSdk.intercept(client);

    // The ambient caller has no IAM permissions, so intercepted Commands
    // must be authorized as that caller and denied, rather than falling back
    // to the Account root default.
    const error = await assertThrowsErrorAsync(async () => {
      await simSdk.simAws.runAs(
        { kind: "arn", arn: `arn:aws:iam::${accountId}:role/NoPermsRole` },
        async () => {
          await client.send(
            new CreateTableCommand({
              TableName: "DeniedTable",
              KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
              AttributeDefinitions: [
                { AttributeName: "id", AttributeType: "S" },
              ],
              BillingMode: "PAY_PER_REQUEST",
            }),
          );
        },
      );
    });
    assertInstanceOf(error, SimIamAccessDenied);

    // And no Table was created with root privileges.
    const listOut = await client.send(new ListTablesCommand({}));
    assertIdentical(listOut.TableNames?.length, 0);
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

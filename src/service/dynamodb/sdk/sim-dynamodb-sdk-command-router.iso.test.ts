import { describe, it } from "vitest";
import {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
  ListTagsOfResourceCommand,
  QueryCommand,
  TagResourceCommand,
  TransactGetItemsCommand,
  TransactWriteItemsCommand,
  UntagResourceCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
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

    const deletionOut = await client.send(
      new DeleteTableCommand({ TableName: "InterceptTable" }),
    );
    assertIdentical(deletionOut.TableDescription?.TableStatus, "DELETING");
    await simSdk.simAws.backgroundTasksComplete();

    const emptyListOut = await client.send(new ListTablesCommand({}));
    assertIdentical(emptyListOut.TableNames?.length, 0);
  });

  it("round-trips Item Commands through an intercepted client", async () => {
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

    const readOut = await client.send(
      new GetItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
      }),
    );
    assertIdentical(readOut.Item?.["name"]?.S, "First item");

    const updateOut = await client.send(
      new UpdateItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
        UpdateExpression: "SET #n = :name",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":name": { S: "Renamed item" } },
        ReturnValues: "ALL_NEW",
      }),
    );
    assertIdentical(updateOut.Attributes?.["name"]?.S, "Renamed item");

    const removalOut = await client.send(
      new DeleteItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
        ReturnValues: "ALL_OLD",
      }),
    );
    assertIdentical(removalOut.Attributes?.["name"]?.S, "Renamed item");

    const missOut = await client.send(
      new GetItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
      }),
    );
    assertUndefined(missOut.Item);
  });

  it("round-trips batch Item Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateTableCommand({
        TableName: "BatchTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    const writeOut = await client.send(
      new BatchWriteItemCommand({
        RequestItems: {
          BatchTable: [
            {
              PutRequest: {
                Item: { id: { S: "item-1" }, name: { S: "First item" } },
              },
            },
            { PutRequest: { Item: { id: { S: "item-2" } } } },
          ],
        },
      }),
    );
    assertObjectEquals(writeOut.UnprocessedItems, {});

    const readOut = await client.send(
      new BatchGetItemCommand({
        RequestItems: {
          BatchTable: {
            Keys: [{ id: { S: "item-1" } }, { id: { S: "missing" } }],
            ProjectionExpression: "#n",
            ExpressionAttributeNames: { "#n": "name" },
          },
        },
      }),
    );
    const items = readOut.Responses?.["BatchTable"];
    assertNonNullable(items);
    assertArrayLength(items, 1);
    assertObjectEquals(items[0], { name: { S: "First item" } });
    assertObjectEquals(readOut.UnprocessedKeys, {});
  });

  it("round-trips transactional Item Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateTableCommand({
        TableName: "TransactTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    await client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "TransactTable",
              Item: { id: { S: "item-1" }, name: { S: "First item" } },
            },
          },
          {
            Update: {
              TableName: "TransactTable",
              Key: { id: { S: "item-2" } },
              UpdateExpression: "SET #n = :name",
              ExpressionAttributeNames: { "#n": "name" },
              ExpressionAttributeValues: { ":name": { S: "Second item" } },
            },
          },
        ],
      }),
    );

    const readOut = await client.send(
      new TransactGetItemsCommand({
        TransactItems: [
          { Get: { TableName: "TransactTable", Key: { id: { S: "item-2" } } } },
          {
            Get: { TableName: "TransactTable", Key: { id: { S: "missing" } } },
          },
        ],
      }),
    );
    const responses = readOut.Responses;
    assertNonNullable(responses);
    assertArrayLength(responses, 2);
    assertIdentical(responses[0].Item?.["name"]?.S, "Second item");
    assertObjectEquals(responses[1], {});
  });

  it("round-trips tag Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    const creation = await client.send(
      new CreateTableCommand({
        TableName: "TaggedTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
        Tags: [{ Key: "Environment", Value: "test" }],
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    const tableArn = creation.TableDescription?.TableArn;
    assertNonNullable(tableArn);

    await client.send(
      new TagResourceCommand({
        ResourceArn: tableArn,
        Tags: [{ Key: "Owner", Value: "platform" }],
      }),
    );
    await client.send(
      new UntagResourceCommand({
        ResourceArn: tableArn,
        TagKeys: ["Environment"],
      }),
    );

    const listed = await client.send(
      new ListTagsOfResourceCommand({ ResourceArn: tableArn }),
    );
    assertNonNullable(listed.Tags);
    assertArrayLength(listed.Tags, 1);
    assertObjectEquals(listed.Tags[0], { Key: "Owner", Value: "platform" });
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
        new QueryCommand({
          TableName: "InterceptTable",
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: { ":id": { S: "item-1" } },
        }),
      );
    });

    assertStringIncludes(error.message, "QueryCommand");
    assertStringIncludes(error.message, "PutItemCommand");
  });
});

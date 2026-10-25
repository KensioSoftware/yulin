import {
  ConditionalCheckFailedException,
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
  TransactionCanceledException,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import { faker } from "@faker-js/faker";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import type { HttpRequest, HttpResponse } from "@smithy/types";
import { describe, it } from "vitest";
import { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkWireDispatcher } from "./sim-sdk-wire-dispatcher.js";

/**
 * A DynamoDB client whose requests go out serialized and signed, and come back
 * from the wire dispatcher for the SDK to deserialize.
 *
 * This is the round trip function code bundling its own SDK makes: nothing
 * reaches the caller that the response body does not carry.
 */
function wireClient(simAws: SimAws): DynamoDBClient {
  const dispatcher = new SimSdkWireDispatcher(simAws);

  return new DynamoDBClient({
    region: "eu-west-2",
    credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "secret" },
    requestHandler: {
      async handle(request: HttpRequest): Promise<{ response: HttpResponse }> {
        const response = await dispatcher.dispatch({
          method: request.method,
          hostname: request.hostname,
          path: request.path,
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([name, value]) => [
              name.toLowerCase(),
              value,
            ]),
          ),
          body: Buffer.from(String(request.body ?? "")),
        });

        return {
          response: {
            statusCode: response.statusCode,
            headers: { ...response.headers },
            body: response.body,
          },
        };
      },
    },
  });
}

/**
 * A simulated table holding a reader's row.
 */
async function simAwsWithReader(): Promise<{
  simAws: SimAws;
  tableName: string;
  readerId: string;
}> {
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
  const tableName = faker.string.alpha(12);
  const readerId = faker.string.uuid();
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: tableName,
      Item: { id: { S: readerId }, uses: { N: "3" } },
    }),
  );

  return { simAws, tableName, readerId };
}

describe("simulated DynamoDB error members over the wire", () => {
  it("carries the cancellation reasons of a cancelled transaction", async () => {
    // Given a table already holding the reader's row.
    const { simAws, tableName, readerId } = await simAwsWithReader();

    // When a transaction whose first action requires that row to be absent is
    // sent through the wire.
    const cancelled = await assertThrowsErrorAsync(async () =>
      wireClient(simAws).send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: { id: { S: readerId } },
                ConditionExpression: "attribute_not_exists(id)",
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { id: { S: "shared" } },
                UpdateExpression: "SET uses = :one",
                ExpressionAttributeValues: { ":one": { N: "1" } },
              },
            },
          ],
        }),
      ),
    );

    // Then the exception the SDK deserialized names which action failed, one
    // reason per action in request order, as real DynamoDB's response does.
    assertInstanceOf(cancelled, TransactionCanceledException);
    assertObjectEquals(cancelled.CancellationReasons ?? [], [
      {
        Code: "ConditionalCheckFailed",
        Message: "The conditional request failed.",
      },
      { Code: "None" },
    ]);

    await simAws.backgroundTasksComplete();
  });

  it("carries the item a failed condition found when asked for it", async () => {
    // Given a table already holding the reader's row.
    const { simAws, tableName, readerId } = await simAwsWithReader();

    // When a write requiring that row to be absent asks for what was there
    // if its condition fails.
    const failed = await assertThrowsErrorAsync(async () =>
      wireClient(simAws).send(
        new PutItemCommand({
          TableName: tableName,
          Item: { id: { S: readerId }, uses: { N: "9" } },
          ConditionExpression: "attribute_not_exists(id)",
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      ),
    );

    // Then the exception carries the row the condition found.
    assertInstanceOf(failed, ConditionalCheckFailedException);
    assertObjectEquals(failed.Item ?? {}, {
      id: { S: readerId },
      uses: { N: "3" },
    });

    await simAws.backgroundTasksComplete();
  });
});

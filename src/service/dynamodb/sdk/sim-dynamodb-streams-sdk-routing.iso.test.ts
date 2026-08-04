import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * A streamed table written to through an intercepted DynamoDB client.
 */
async function streamedTable(simSdk: SimSdk): Promise<void> {
  const client = new DynamoDBClient({ region: "eu-west-2" });
  simSdk.intercept(client);

  await client.send(
    new CreateTableCommand({
      TableName: "orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_IMAGE",
      },
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  await client.send(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: "order-1" } },
    }),
  );
}

describe("simulated DynamoDB Streams SDK Command routing", () => {
  it("reads a table's captured changes through an intercepted Streams client", async () => {
    // Given a streamed table and an intercepted DynamoDB Streams client, which
    // is a client of its own with a service identity of its own.
    const simSdk = new SimSdk();
    await streamedTable(simSdk);

    const streamsClient = new DynamoDBStreamsClient({ region: "eu-west-2" });
    simSdk.intercept(streamsClient);

    // When the four Streams operations are used the way an application would.
    const listed = await streamsClient.send(
      new ListStreamsCommand({ TableName: "orders" }),
    );
    const streamArn = listed.Streams?.[0]?.StreamArn;
    assertNonNullable(streamArn);

    const described = await streamsClient.send(
      new DescribeStreamCommand({ StreamArn: streamArn }),
    );
    const shardId = described.StreamDescription?.Shards?.[0]?.ShardId;
    assertNonNullable(shardId);

    const iterator = await streamsClient.send(
      new GetShardIteratorCommand({
        StreamArn: streamArn,
        ShardId: shardId,
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const records = await streamsClient.send(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

    // Then the change the DynamoDB client made comes back off the stream.
    assertIdentical(described.StreamDescription?.StreamViewType, "NEW_IMAGE");
    assertArrayLength(records.Records, 1);
    assertIdentical(records.Records[0].eventName, "INSERT");
    assertIdentical(
      records.Records[0].dynamodb?.NewImage?.["orderId"]?.S,
      "order-1",
    );
    assertIdentical(records.Records[0].awsRegion, "eu-west-2");
  });

  it("names every Command simulated DynamoDB Streams handles", () => {
    // Given a scoped simulated DynamoDB Streams.
    const simAws = new SimAws();
    const router = simAws.dynamoDbStreams().sdkCommandRouter();

    // When its supported Command names are asked for.
    // Then the four Streams operations are routable by SDK Command name, and
    // nothing the DynamoDB client sends is.
    assertArrayEquals(router.supportedCommandNames(), [
      "ListStreamsCommand",
      "DescribeStreamCommand",
      "GetShardIteratorCommand",
      "GetRecordsCommand",
    ]);
    assertUndefined(router.route("PutItemCommand"));
  });
});

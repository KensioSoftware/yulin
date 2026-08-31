import { PutItemCommand, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { DescribeStreamCommand } from "@aws-sdk/client-dynamodb-streams";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../../iam/error/sim-iam.error.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../../error/dynamodb.error.js";
import { simDynamoDbStreamedTableFactory } from "../../../stream/sim-dynamodb-streamed-table.factory.js";

/**
 * The ARN of the stream a streamed table is capturing onto.
 */
async function streamArnOf(simAws: SimAws): Promise<string> {
  const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
  const arn = table.stream.latest?.arn;
  assertDefined(arn, "DynamoDB table stream ARN");

  return arn;
}

describe("DynamoDB Streams DescribeStream", () => {
  it("reports the shard, the view type and the stream status", async () => {
    // Given a stream with one record on it.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // When the stream is described.
    const output = await simAws
      .dynamoDbStreams()
      .describeStream(new DescribeStreamCommand({ StreamArn: streamArn }));

    // Then it reports itself as enabled, with the images its records carry and
    // the key schema they are cut with.
    const description = output.StreamDescription;
    assertNonNullable(description);
    assertIdentical(description.StreamArn, streamArn);
    assertIdentical(description.StreamStatus, "ENABLED");
    assertIdentical(description.StreamViewType, "NEW_AND_OLD_IMAGES");
    assertIdentical(description.TableName, "orders");
    assertArrayLength(description.KeySchema, 1);
    assertIdentical(description.KeySchema[0].AttributeName, "orderId");

    // And its one open shard starts at the record on it and has no end.
    assertArrayLength(description.Shards, 1);
    const range = description.Shards[0].SequenceNumberRange;
    assertNonNullable(range);
    assertIdentical(range.StartingSequenceNumber, "100000000000000000000");
    assertUndefined(range.EndingSequenceNumber);
    assertUndefined(description.LastEvaluatedShardId);
  });

  it("closes the shard of a stream its table has switched off", async () => {
    // Given a stream with a record on it that is then disabled.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the disabled stream is described.
    const output = await simAws
      .dynamoDbStreams()
      .describeStream(new DescribeStreamCommand({ StreamArn: streamArn }));

    // Then it is off, and its shard ends at the last record it took.
    const description = output.StreamDescription;
    assertNonNullable(description);
    assertIdentical(description.StreamStatus, "DISABLED");
    assertArrayLength(description.Shards, 1);
    const range = description.Shards[0].SequenceNumberRange;
    assertNonNullable(range);
    assertIdentical(range.EndingSequenceNumber, "100000000000000000000");
  });

  it("reports no stream for an ARN naming none", async () => {
    // Given a simulated DynamoDB with one stream on it.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);

    // When a stream nobody was ever handed is described.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().describeStream(
        new DescribeStreamCommand({
          StreamArn: `${streamArn}-not-a-stream`,
        }),
      ),
    );

    // Then it is simply not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("refuses a ShardFilter it cannot honour", async () => {
    // Given a stream.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);

    // When it is described with a shard filter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().describeStream(
        new DescribeStreamCommand({
          StreamArn: streamArn,
          ShardFilter: { Type: "CHILD_SHARDS", ShardId: "shardId-0" },
        }),
      ),
    );

    // Then it is refused by name rather than answered with an unfiltered
    // shard list, since a simulated stream has no shard lineage.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });

  it("pages the one shard a stream has", async () => {
    // Given a stream.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);
    const first = await simAws
      .dynamoDbStreams()
      .describeStream(new DescribeStreamCommand({ StreamArn: streamArn }));
    const shardId = first.StreamDescription?.Shards?.[0]?.ShardId;

    // When the shards are asked for again from after the one that came back.
    const second = await simAws.dynamoDbStreams().describeStream(
      new DescribeStreamCommand({
        StreamArn: streamArn,
        ExclusiveStartShardId: shardId,
      }),
    );

    // Then there is nothing left to report, rather than the same shard over
    // again.
    assertArrayEmpty(second.StreamDescription?.Shards);

    // And a page size DynamoDB would not take is refused.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().describeStream(
        new DescribeStreamCommand({
          StreamArn: streamArn,
          Limit: 0,
        }),
      ),
    );
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("denies a caller without dynamodb:DescribeStream on the stream ARN", async () => {
    // Given a Role with no DynamoDB permissions.
    const simAws = new SimAws();
    const streamArn = await streamArnOf(simAws);

    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoDescribeStreamRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When that Role describes the stream.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .describeStream(new DescribeStreamCommand({ StreamArn: streamArn }), {
          caller: { kind: "arn", arn: roleCreation.Role.Arn },
        }),
    );

    // Then it is refused against the stream's own ARN rather than the table's.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:DescribeStream");
    assertIdentical(error.resource, streamArn);

    // And a request the simulation would refuse anyway is still refused for
    // the caller first, so what is and is not simulated stays behind IAM.
    const filtered = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().describeStream(
        new DescribeStreamCommand({
          StreamArn: streamArn,
          ShardFilter: { Type: "CHILD_SHARDS" },
        }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );
    assertInstanceOf(filtered, SimIamAccessDenied);
  });
});

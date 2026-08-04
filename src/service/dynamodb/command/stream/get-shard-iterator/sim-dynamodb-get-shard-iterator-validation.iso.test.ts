import { GetShardIteratorCommand } from "@aws-sdk/client-dynamodb-streams";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../../iam/error/sim-iam.error.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../../error/dynamodb.error.js";
import { simDynamoDbStreamedOrdersFactory } from "../../../stream/sim-dynamodb-streamed-orders.factory.js";

/**
 * The sequence number the first record on a fresh stream carries.
 */
const firstSequenceNumber = "100000000000000000000";

describe("DynamoDB Streams GetShardIterator request checking", () => {
  it("refuses a sequence number given with LATEST", async () => {
    // Given a stream with a record on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When an iterator asks for LATEST and names a record as well.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator(
        new GetShardIteratorCommand({
          StreamArn: stream.arn,
          ShardId: stream.shard.shardId,
          ShardIteratorType: "LATEST",
          SequenceNumber: firstSequenceNumber,
        }),
      ),
    );

    // Then the request is refused rather than one of the two being dropped.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses AT_SEQUENCE_NUMBER with no sequence number", async () => {
    // Given a stream with a record on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When an iterator names a record without saying which.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator(
        new GetShardIteratorCommand({
          StreamArn: stream.arn,
          ShardId: stream.shard.shardId,
          ShardIteratorType: "AT_SEQUENCE_NUMBER",
        }),
      ),
    );

    // Then the request is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses a shard iterator type it does not know", async () => {
    // Given a stream with a record on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When an iterator asks to start somewhere DynamoDB has no name for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator({
        input: {
          StreamArn: stream.arn,
          ShardId: stream.shard.shardId,
          ShardIteratorType: "OLDEST",
        },
      }),
    );

    // Then the request is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses a request naming no stream and one naming no shard", async () => {
    // Given a stream with a record on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When an iterator is asked for without a stream to read.
    const withoutStream = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .getShardIterator({ input: { ShardIteratorType: "TRIM_HORIZON" } }),
    );

    // And when one is asked for without a shard to read.
    const withoutShard = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator({
        input: {
          StreamArn: stream.arn,
          ShardIteratorType: "TRIM_HORIZON",
        },
      }),
    );

    // Then both are refused as incomplete requests rather than as anything
    // being missing from the simulation.
    assertInstanceOf(withoutStream, SimDynamoDbValidationException);
    assertInstanceOf(withoutShard, SimDynamoDbValidationException);
  });

  it("reports no shard for a shard identifier the stream has not got", async () => {
    // Given a stream with a record on it.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When an iterator is asked for on another shard.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator(
        new GetShardIteratorCommand({
          StreamArn: stream.arn,
          ShardId: "shardId-00000000000000000000-deadbeef",
          ShardIteratorType: "TRIM_HORIZON",
        }),
      ),
    );

    // Then the shard is simply not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("denies a caller without dynamodb:GetShardIterator on the stream ARN", async () => {
    // Given a Role with no DynamoDB permissions.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoIteratorRole",
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

    // When that Role asks for an iterator.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getShardIterator(
        new GetShardIteratorCommand({
          StreamArn: stream.arn,
          ShardId: stream.shard.shardId,
          ShardIteratorType: "TRIM_HORIZON",
        }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then it is refused against the stream's own ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:GetShardIterator");
    assertIdentical(error.resource, stream.arn);
  });
});

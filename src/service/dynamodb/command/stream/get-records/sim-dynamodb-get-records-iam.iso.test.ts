import {
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
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
import { simDynamoDbStreamStart } from "../../../stream/sim-dynamodb-stream-position.js";
import { simDynamoDbShardIteratorToken } from "../../../stream/sim-dynamodb-stream-shard-iterator.js";
import { simDynamoDbStreamedOrdersFactory } from "../../../stream/sim-dynamodb-streamed-orders.factory.js";

describe("DynamoDB Streams GetRecords request checking", () => {
  it("refuses a Limit above the batch cap", async () => {
    // Given a stream with a record on it, and an iterator for its shard.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);
    const iterator = await simAws.dynamoDbStreams().getShardIterator(
      new GetShardIteratorCommand({
        StreamArn: stream.arn,
        ShardId: stream.shard.shardId,
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );

    // When more than one batch of records is asked for at once.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDbStreams().getRecords(
        new GetRecordsCommand({
          ShardIterator: iterator.ShardIterator,
          Limit: 1001,
        }),
      ),
    );

    // Then the request is refused rather than quietly given fewer, which a
    // consumer could not tell from having caught up.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("refuses a shard iterator it never handed out", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simDynamoDbStreamedOrdersFactory.make({}, simAws);

    // When something that is not one of its iterators is read from.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .getRecords(new GetRecordsCommand({ ShardIterator: "not-one" })),
    );

    // Then it is refused as invalid input.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it("reports no shard for an iterator naming one the stream has not got", async () => {
    // Given an iterator built for a shard this stream never had, which is what
    // an iterator kept across a stream being switched off and on again is.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);
    const iterator = simDynamoDbShardIteratorToken({
      streamArn: stream.arn,
      shardId: "shardId-00000000000000000000-deadbeef",
      position: simDynamoDbStreamStart,
    });

    // When it is read from.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .getRecords(new GetRecordsCommand({ ShardIterator: iterator })),
    );

    // Then the shard is simply not found.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
  });

  it("denies a caller without dynamodb:GetRecords on the stream ARN", async () => {
    // Given a Role with no DynamoDB permissions, and an iterator to read with.
    const simAws = new SimAws();
    const stream = await simDynamoDbStreamedOrdersFactory.make({}, simAws);
    const iterator = await simAws.dynamoDbStreams().getShardIterator(
      new GetShardIteratorCommand({
        StreamArn: stream.arn,
        ShardId: stream.shard.shardId,
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "NoGetRecordsRole",
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

    // When that Role reads the shard.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDbStreams()
        .getRecords(
          new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
          { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
        ),
    );

    // Then it is refused against the stream the iterator belongs to, which the
    // request never named separately.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:GetRecords");
    assertIdentical(error.resource, stream.arn);
  });
});

import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../../error/dynamodb.error.js";
import type { SimDynamoDbStream } from "../../../stream/sim-dynamodb-stream.js";
import type { SimDynamoDbStreamShardDescription } from "../stream.types.js";
import type { SimDynamoDbStreamAccess } from "../sim-dynamodb-stream-access.js";
import type {
  SimDescribeStreamCommand,
  SimDescribeStreamCommandOutput,
} from "./describe-stream.command.js";

interface SimDynamoDbDescribeStreamProperties {
  readonly access: SimDynamoDbStreamAccess;
}

interface SimDynamoDbDescribeStreamOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The greatest number of shards one DescribeStream reports.
 */
const greatestLimit = 100;

/**
 * Refuse a page size DynamoDB would not take.
 */
function assertLimit(limit: number | undefined): void {
  if (limit === undefined) {
    return;
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > greatestLimit) {
    throw new SimDynamoDbValidationException(
      `Limit ${limit.toString()} is invalid. It is a whole number between 1 ` +
        `and ${greatestLimit.toString()}.`,
    );
  }
}

/**
 * The shards of a stream a request asks for, which is its one shard or none.
 *
 * A simulated stream has one shard, so a `Limit` of at least one never cuts the
 * page short. `ExclusiveStartShardId` naming that shard does leave nothing to
 * report, which is what a caller resuming from it means, so it is honoured
 * rather than ignored.
 */
function shardsOf(
  stream: SimDynamoDbStream,
  exclusiveStartShardId: string | undefined,
): readonly SimDynamoDbStreamShardDescription[] {
  if (exclusiveStartShardId === stream.shard.shardId) {
    return [];
  }

  return [
    {
      ShardId: stream.shard.shardId,
      SequenceNumberRange: {
        StartingSequenceNumber: stream.shard.startingSequenceNumber,
        EndingSequenceNumber: stream.shard.endingSequenceNumber,
      },
    },
  ];
}

/**
 * The command that reports a stream, its shard and what its records carry.
 */
export class SimDynamoDbDescribeStream {
  private readonly access: SimDynamoDbStreamAccess;

  constructor(properties: SimDynamoDbDescribeStreamProperties) {
    this.access = properties.access;
  }

  /**
   * Describe the stream an ARN names.
   *
   * `LastEvaluatedShardId` is never reported: there is one shard, so a page of
   * them is always the whole of them, and a token would send a caller round a
   * loop for a shard that does not exist.
   */
  handle(
    command: SimDescribeStreamCommand,
    options?: SimDynamoDbDescribeStreamOptions,
  ): SimDescribeStreamCommandOutput {
    const stream = this.access.required(
      "dynamodb:DescribeStream",
      command.input.StreamArn,
      options?.caller,
    );

    if (command.input.ShardFilter !== undefined) {
      throw new SimDynamoDbUnsupportedOperation(
        "DescribeStream ShardFilter is not simulated: a simulated stream has " +
          "one shard and never splits, so it has no shard lineage to filter",
      );
    }

    assertLimit(command.input.Limit);

    return {
      StreamDescription: {
        StreamArn: stream.arn,
        StreamLabel: stream.label,
        StreamStatus: stream.status,
        StreamViewType: stream.viewType,
        CreationRequestDateTime: stream.enabledAt,
        TableName: stream.tableName,
        KeySchema: stream.keySchemaElements,
        Shards: shardsOf(stream, command.input.ExclusiveStartShardId),
      },
      $metadata: {},
    };
  }
}

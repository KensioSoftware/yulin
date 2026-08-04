import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbUnsupportedOperation } from "../../../error/dynamodb.error.js";
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
 * The one shard of a stream, as DescribeStream reports it.
 */
function shardOf(stream: SimDynamoDbStream): SimDynamoDbStreamShardDescription {
  return {
    ShardId: stream.shard.shardId,
    SequenceNumberRange: {
      StartingSequenceNumber: stream.shard.startingSequenceNumber,
      EndingSequenceNumber: stream.shard.endingSequenceNumber,
    },
  };
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
    if (command.input.ShardFilter !== undefined) {
      throw new SimDynamoDbUnsupportedOperation(
        "DescribeStream ShardFilter is not simulated: a simulated stream has " +
          "one shard and never splits, so it has no shard lineage to filter",
      );
    }

    const stream = this.access.required(
      "dynamodb:DescribeStream",
      command.input.StreamArn,
      options?.caller,
    );

    return {
      StreamDescription: {
        StreamArn: stream.arn,
        StreamLabel: stream.label,
        StreamStatus: stream.status,
        StreamViewType: stream.viewType,
        CreationRequestDateTime: stream.enabledAt,
        TableName: stream.tableName,
        KeySchema: stream.keySchemaElements,
        Shards: [shardOf(stream)],
      },
      $metadata: {},
    };
  }
}

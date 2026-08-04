import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../../error/dynamodb.error.js";
import { assertSimDynamoDbStreamPositionReadable } from "../../../stream/sim-dynamodb-stream-read.js";
import { simDynamoDbShardIteratorToken } from "../../../stream/sim-dynamodb-stream-shard-iterator.js";
import type { SimDynamoDbStreamAccess } from "../sim-dynamodb-stream-access.js";
import { simDynamoDbShardIteratorPosition } from "./sim-dynamodb-shard-iterator-position.js";
import type {
  SimGetShardIteratorCommand,
  SimGetShardIteratorCommandOutput,
} from "./get-shard-iterator.command.js";

interface SimDynamoDbGetShardIteratorProperties {
  readonly access: SimDynamoDbStreamAccess;
}

interface SimDynamoDbGetShardIteratorOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The command that hands out a place to start reading a shard from.
 */
export class SimDynamoDbGetShardIterator {
  private readonly access: SimDynamoDbStreamAccess;

  constructor(properties: SimDynamoDbGetShardIteratorProperties) {
    this.access = properties.access;
  }

  /**
   * Get an iterator for a shard of a stream.
   *
   * A sequence number the retention window has already outlived is refused
   * here rather than at the GetRecords that would have used the iterator, so a
   * consumer resuming from a checkpoint it kept too long finds out at the call
   * that asked.
   */
  handle(
    command: SimGetShardIteratorCommand,
    options?: SimDynamoDbGetShardIteratorOptions,
  ): SimGetShardIteratorCommandOutput {
    const stream = this.access.required(
      "dynamodb:GetShardIterator",
      command.input.StreamArn,
      options?.caller,
    );

    const shardId = command.input.ShardId;
    if (shardId === undefined) {
      throw new SimDynamoDbValidationException(
        "GetShardIterator requires a ShardId",
      );
    }

    if (shardId !== stream.shard.shardId) {
      throw new SimDynamoDbResourceNotFoundException(
        `Stream ${stream.arn} has no shard ${shardId}`,
      );
    }

    const position = simDynamoDbShardIteratorPosition(
      command.input,
      stream.shard,
    );
    assertSimDynamoDbStreamPositionReadable(stream.shard, position);

    return {
      ShardIterator: simDynamoDbShardIteratorToken({
        streamArn: stream.arn,
        shardId: stream.shard.shardId,
        position,
      }),
      $metadata: {},
    };
  }
}

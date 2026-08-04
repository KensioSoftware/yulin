import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../../../error/dynamodb.error.js";
import { simDynamoDbStreamRead } from "../../../stream/sim-dynamodb-stream-read.js";
import {
  readSimDynamoDbShardIteratorToken,
  simDynamoDbShardIteratorToken,
} from "../../../stream/sim-dynamodb-stream-shard-iterator.js";
import type { SimDynamoDbStreamAccess } from "../sim-dynamodb-stream-access.js";
import { simDynamoDbStreamsApiRecord } from "./sim-dynamodb-streams-api-record.js";
import type {
  SimGetRecordsCommand,
  SimGetRecordsCommandOutput,
} from "./get-records.command.js";

/**
 * The most records one GetRecords hands back, whatever the request asks for.
 */
const greatestLimit = 1000;

interface SimDynamoDbGetRecordsProperties {
  readonly access: SimDynamoDbStreamAccess;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimDynamoDbGetRecordsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Read the batch size a request asks for.
 *
 * A request asking for more than the cap is refused rather than quietly given
 * fewer, since a consumer that thinks it asked for 5000 and got 1000 has no way
 * of telling that from having caught up.
 */
function readLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return greatestLimit;
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > greatestLimit) {
    throw new SimDynamoDbValidationException(
      `Limit ${limit.toString()} is invalid. It is a whole number between 1 ` +
        `and ${greatestLimit.toString()}.`,
    );
  }

  return limit;
}

/**
 * The command that reads records off a shard.
 */
export class SimDynamoDbGetRecords {
  private readonly access: SimDynamoDbStreamAccess;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimDynamoDbGetRecordsProperties) {
    this.access = properties.access;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read from where a shard iterator points, and say where to carry on.
   *
   * The iterator carries the stream it belongs to, so the caller is authorized
   * against that stream's ARN rather than against anything the request names
   * separately.
   */
  handle(
    command: SimGetRecordsCommand,
    options?: SimDynamoDbGetRecordsOptions,
  ): SimGetRecordsCommandOutput {
    const iterator = readSimDynamoDbShardIteratorToken(
      command.input.ShardIterator,
    );
    const limit = readLimit(command.input.Limit);
    const stream = this.access.required(
      "dynamodb:GetRecords",
      iterator.streamArn,
      options?.caller,
    );

    if (iterator.shardId !== stream.shard.shardId) {
      throw new SimDynamoDbResourceNotFoundException(
        `Stream ${stream.arn} has no shard ${iterator.shardId}`,
      );
    }

    const read = simDynamoDbStreamRead(stream.shard, iterator.position, limit);

    return {
      Records: read.records.map((record) =>
        simDynamoDbStreamsApiRecord(record, this.accountRegionScope.regionName),
      ),
      NextShardIterator: read.drained
        ? undefined
        : simDynamoDbShardIteratorToken({ ...iterator, position: read.next }),
      $metadata: {},
    };
  }
}

/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb-streams/command/GetRecordsCommand/
 */

import type { SimResponseMetadata } from "../../../../aws/metadata/response-metadata.type.js";
import type { SimDynamoDbStreamsRecord } from "../stream.types.js";

/**
 * Minimal structural sim DynamoDB Streams GetRecords command.
 */
export interface SimGetRecordsCommand {
  readonly input: SimGetRecordsCommandInput;
}

/**
 * Minimal structural sim DynamoDB Streams GetRecords input.
 */
export interface SimGetRecordsCommandInput {
  readonly ShardIterator?: string | undefined;
  readonly Limit?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams GetRecords output.
 *
 * An empty `Records` with a `NextShardIterator` is the ordinary answer for a
 * reader that has caught up, and is not smoothed away into anything else.
 * `NextShardIterator` is absent only when the shard is closed and the reader
 * has reached the end of it, which is how a consumer knows to stop.
 */
export interface SimGetRecordsCommandOutput {
  readonly Records?: readonly SimDynamoDbStreamsRecord[] | undefined;
  readonly NextShardIterator?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

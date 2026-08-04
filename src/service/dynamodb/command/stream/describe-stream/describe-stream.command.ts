/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb-streams/command/DescribeStreamCommand/
 */

import type { SimResponseMetadata } from "../../../../aws/metadata/response-metadata.type.js";
import type { SimDynamoDbStreamDescription } from "../stream.types.js";

/**
 * Minimal structural sim DynamoDB Streams shard filter.
 *
 * Declared so a request asking for one is refused by name. A simulated stream
 * has one shard and never splits, so there is no lineage for a filter to walk.
 */
export interface SimDynamoDbShardFilter {
  readonly Type?: string | undefined;
  readonly ShardId?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams DescribeStream command.
 */
export interface SimDescribeStreamCommand {
  readonly input: SimDescribeStreamCommandInput;
}

/**
 * Minimal structural sim DynamoDB Streams DescribeStream input.
 *
 * `Limit` and `ExclusiveStartShardId` page through a stream's shards. A
 * simulated stream has exactly one, so a page of them is never cut short and
 * neither parameter can change what comes back.
 */
export interface SimDescribeStreamCommandInput {
  readonly StreamArn?: string | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartShardId?: string | undefined;
  readonly ShardFilter?: SimDynamoDbShardFilter | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams DescribeStream output.
 */
export interface SimDescribeStreamCommandOutput {
  readonly StreamDescription?: SimDynamoDbStreamDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

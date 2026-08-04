/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb-streams/command/GetShardIteratorCommand/
 */

import type { SimResponseMetadata } from "../../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim DynamoDB Streams GetShardIterator command.
 */
export interface SimGetShardIteratorCommand {
  readonly input: SimGetShardIteratorCommandInput;
}

/**
 * Minimal structural sim DynamoDB Streams GetShardIterator input.
 *
 * `SequenceNumber` belongs with the two iterator types that name a record, and
 * is refused with the two that do not, so a request cannot half-say where it
 * means to start.
 */
export interface SimGetShardIteratorCommandInput {
  readonly StreamArn?: string | undefined;
  readonly ShardId?: string | undefined;
  readonly ShardIteratorType?: string | undefined;
  readonly SequenceNumber?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams GetShardIterator output.
 */
export interface SimGetShardIteratorCommandOutput {
  readonly ShardIterator?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

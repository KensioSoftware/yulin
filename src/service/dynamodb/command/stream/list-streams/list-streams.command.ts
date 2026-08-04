/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb-streams/command/ListStreamsCommand/
 */

import type { SimArn } from "../../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../../aws/metadata/response-metadata.type.js";
import type { SimDynamoDbStreamSummary } from "../stream.types.js";

/**
 * Minimal structural sim DynamoDB Streams ListStreams command.
 */
export interface SimListStreamsCommand {
  readonly input: SimListStreamsCommandInput;
}

/**
 * Minimal structural sim DynamoDB Streams ListStreams input.
 *
 * `TableName` narrows the answer to one table's streams. Real DynamoDB takes
 * the table's name here rather than its ARN, unlike the DynamoDB API's own
 * `TableName` parameters.
 */
export interface SimListStreamsCommandInput {
  readonly TableName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly ExclusiveStartStreamArn?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB Streams ListStreams output.
 */
export interface SimListStreamsCommandOutput {
  readonly Streams?: readonly SimDynamoDbStreamSummary[] | undefined;
  readonly LastEvaluatedStreamArn?: SimArn | undefined;
  readonly $metadata: SimResponseMetadata;
}

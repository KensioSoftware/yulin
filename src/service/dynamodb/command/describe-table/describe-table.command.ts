import type { SimDynamoDbTableDescription as SimDynamoDatabaseTableDescription } from "../table/table.command.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim DynamoDB DescribeTable command.
 */
export interface SimDescribeTableCommand {
  readonly input: SimDescribeTableCommandInput;
}

/**
 * Minimal structural sim DynamoDB DescribeTable input.
 */
export interface SimDescribeTableCommandInput {
  readonly TableName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DescribeTable output.
 */
export interface SimDescribeTableCommandOutput {
  readonly Table?: SimDynamoDatabaseTableDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

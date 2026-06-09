import type { SimDynamoDbTableDescription } from "../create-table/create-table.cmd.js";

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
  readonly Table?: SimDynamoDbTableDescription | undefined;
  readonly $metadata: Record<string, unknown>;
}

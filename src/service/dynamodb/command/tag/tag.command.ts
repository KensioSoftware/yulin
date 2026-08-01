import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbTag,
  SimDynamoDbTagInput,
} from "../table/table.types.js";

/**
 * Minimal structural sim DynamoDB TagResource command.
 */
export interface SimTagResourceCommand {
  readonly input: SimTagResourceCommandInput;
}

/**
 * Minimal structural sim DynamoDB TagResource input.
 *
 * The resource is named by its ARN rather than by its name, which is how every
 * tag command names one.
 */
export interface SimTagResourceCommandInput {
  readonly ResourceArn?: string | undefined;
  readonly Tags?: readonly SimDynamoDbTagInput[] | undefined;
}

/**
 * Minimal structural sim DynamoDB TagResource output.
 *
 * Real DynamoDB answers with an empty body, so `ListTagsOfResource` is the only
 * way to see what a tag request did.
 */
export interface SimTagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB UntagResource command.
 */
export interface SimUntagResourceCommand {
  readonly input: SimUntagResourceCommandInput;
}

/**
 * Minimal structural sim DynamoDB UntagResource input.
 */
export interface SimUntagResourceCommandInput {
  readonly ResourceArn?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

/**
 * Minimal structural sim DynamoDB UntagResource output.
 */
export interface SimUntagResourceCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB ListTagsOfResource command.
 */
export interface SimListTagsOfResourceCommand {
  readonly input: SimListTagsOfResourceCommandInput;
}

/**
 * Minimal structural sim DynamoDB ListTagsOfResource input.
 *
 * There is no page size to ask for. The API has no such parameter, so how many
 * tags a page carries is the service's to decide.
 */
export interface SimListTagsOfResourceCommandInput {
  readonly ResourceArn?: string | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB ListTagsOfResource output.
 *
 * `NextToken` is absent on the last page, so a caller looping until it is gone
 * terminates.
 */
export interface SimListTagsOfResourceCommandOutput {
  readonly Tags: readonly SimDynamoDbTag[];
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

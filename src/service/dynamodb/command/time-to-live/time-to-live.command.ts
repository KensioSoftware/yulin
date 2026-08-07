import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimDynamoDbTimeToLiveDescription,
  SimDynamoDbTimeToLiveSpecificationInput,
} from "./time-to-live.types.js";

/**
 * Minimal structural sim DynamoDB UpdateTimeToLive command.
 */
export interface SimUpdateTimeToLiveCommand {
  readonly input: SimUpdateTimeToLiveCommandInput;
}

/**
 * Minimal structural sim DynamoDB UpdateTimeToLive input.
 *
 * `TableName` takes the table's name or its ARN, as real DynamoDB does.
 */
export interface SimUpdateTimeToLiveCommandInput {
  readonly TableName?: string | undefined;
  readonly TimeToLiveSpecification?:
    | SimDynamoDbTimeToLiveSpecificationInput
    | undefined;
}

/**
 * Minimal structural sim DynamoDB UpdateTimeToLive output.
 *
 * The specification comes back as the request gave it, which is what real
 * DynamoDB answers with while the change is still ENABLING or DISABLING.
 */
export interface SimUpdateTimeToLiveCommandOutput {
  readonly TimeToLiveSpecification?:
    | SimDynamoDbTimeToLiveSpecificationInput
    | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim DynamoDB DescribeTimeToLive command.
 */
export interface SimDescribeTimeToLiveCommand {
  readonly input: SimDescribeTimeToLiveCommandInput;
}

/**
 * Minimal structural sim DynamoDB DescribeTimeToLive input.
 */
export interface SimDescribeTimeToLiveCommandInput {
  readonly TableName?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB DescribeTimeToLive output.
 */
export interface SimDescribeTimeToLiveCommandOutput {
  readonly TimeToLiveDescription?: SimDynamoDbTimeToLiveDescription | undefined;
  readonly $metadata: SimResponseMetadata;
}

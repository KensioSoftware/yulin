import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * A tag on a Personalize resource.
 *
 * Personalize names the parts of a tag `tagKey` and `tagValue`, where most AWS
 * services use `Key` and `Value`.
 */
export interface SimPersonalizeTag {
  readonly tagKey?: string | undefined;
  readonly tagValue?: string | undefined;
}

/**
 * Minimal structural sim Personalize CreateDatasetGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateDatasetGroupCommand/
 */
export interface SimCreateDatasetGroupCommand {
  readonly input: SimCreateDatasetGroupCommandInput;
}

export interface SimCreateDatasetGroupCommandInput {
  readonly name?: string | undefined;
  readonly roleArn?: string | undefined;
  readonly kmsKeyArn?: string | undefined;
  readonly domain?: string | undefined;
  readonly tags?: readonly SimPersonalizeTag[] | undefined;
}

export interface SimCreateDatasetGroupCommandOutput {
  readonly datasetGroupArn?: string | undefined;
  readonly domain?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A dataset group as Describe reports it.
 */
export interface SimPersonalizeDatasetGroupDetail {
  readonly name?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly status?: string | undefined;
  readonly roleArn?: string | undefined;
  readonly kmsKeyArn?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
  readonly domain?: string | undefined;
}

/**
 * Minimal structural sim Personalize DescribeDatasetGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeDatasetGroupCommand/
 */
export interface SimDescribeDatasetGroupCommand {
  readonly input: SimDescribeDatasetGroupCommandInput;
}

export interface SimDescribeDatasetGroupCommandInput {
  readonly datasetGroupArn?: string | undefined;
}

export interface SimDescribeDatasetGroupCommandOutput {
  readonly datasetGroup?: SimPersonalizeDatasetGroupDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A dataset group as List reports it, which leaves out the KMS key and the
 * role real Personalize only reports from Describe.
 */
export interface SimPersonalizeDatasetGroupSummary {
  readonly name?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
  readonly domain?: string | undefined;
}

/**
 * Minimal structural sim Personalize ListDatasetGroups command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListDatasetGroupsCommand/
 */
export interface SimListDatasetGroupsCommand {
  readonly input?: SimListDatasetGroupsCommandInput | undefined;
}

export interface SimListDatasetGroupsCommandInput {
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListDatasetGroupsCommandOutput {
  readonly datasetGroups?:
    | readonly SimPersonalizeDatasetGroupSummary[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteDatasetGroup command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteDatasetGroupCommand/
 */
export interface SimDeleteDatasetGroupCommand {
  readonly input: SimDeleteDatasetGroupCommandInput;
}

export interface SimDeleteDatasetGroupCommandInput {
  readonly datasetGroupArn?: string | undefined;
}

export interface SimDeleteDatasetGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

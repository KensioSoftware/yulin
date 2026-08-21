import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Personalize CreateDataset command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateDatasetCommand/
 */
export interface SimCreateDatasetCommand {
  readonly input: SimCreateDatasetCommandInput;
}

export interface SimCreateDatasetCommandInput {
  readonly name?: string | undefined;
  readonly schemaArn?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly datasetType?: string | undefined;
}

export interface SimCreateDatasetCommandOutput {
  readonly datasetArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A dataset as Describe reports it.
 */
export interface SimPersonalizeDatasetDetail {
  readonly name?: string | undefined;
  readonly datasetArn?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly datasetType?: string | undefined;
  readonly schemaArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeDataset command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeDatasetCommand/
 */
export interface SimDescribeDatasetCommand {
  readonly input: SimDescribeDatasetCommandInput;
}

export interface SimDescribeDatasetCommandInput {
  readonly datasetArn?: string | undefined;
}

export interface SimDescribeDatasetCommandOutput {
  readonly dataset?: SimPersonalizeDatasetDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A dataset as List reports it, which leaves out the schema real Personalize
 * only reports from Describe.
 */
export interface SimPersonalizeDatasetSummary {
  readonly name?: string | undefined;
  readonly datasetArn?: string | undefined;
  readonly datasetType?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize ListDatasets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListDatasetsCommand/
 */
export interface SimListDatasetsCommand {
  readonly input?: SimListDatasetsCommandInput | undefined;
}

export interface SimListDatasetsCommandInput {
  readonly datasetGroupArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListDatasetsCommandOutput {
  readonly datasets?: readonly SimPersonalizeDatasetSummary[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteDataset command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteDatasetCommand/
 */
export interface SimDeleteDatasetCommand {
  readonly input: SimDeleteDatasetCommandInput;
}

export interface SimDeleteDatasetCommandInput {
  readonly datasetArn?: string | undefined;
}

export interface SimDeleteDatasetCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

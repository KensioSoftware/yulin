import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Personalize CreateSolution command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateSolutionCommand/
 */
export interface SimCreateSolutionCommand {
  readonly input: SimCreateSolutionCommandInput;
}

export interface SimCreateSolutionCommandInput {
  readonly name?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly eventType?: string | undefined;
  readonly performAutoML?: boolean | undefined;
  readonly performHPO?: boolean | undefined;
}

export interface SimCreateSolutionCommandOutput {
  readonly solutionArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A solution as Describe reports it.
 */
export interface SimPersonalizeSolutionDetail {
  readonly name?: string | undefined;
  readonly solutionArn?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly eventType?: string | undefined;
  readonly performAutoML?: boolean | undefined;
  readonly performHPO?: boolean | undefined;
  readonly status?: string | undefined;
  readonly latestSolutionVersion?:
    | SimPersonalizeSolutionVersionSummary
    | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeSolution command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeSolutionCommand/
 */
export interface SimDescribeSolutionCommand {
  readonly input: SimDescribeSolutionCommandInput;
}

export interface SimDescribeSolutionCommandInput {
  readonly solutionArn?: string | undefined;
}

export interface SimDescribeSolutionCommandOutput {
  readonly solution?: SimPersonalizeSolutionDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A solution as List reports it.
 */
export interface SimPersonalizeSolutionSummary {
  readonly name?: string | undefined;
  readonly solutionArn?: string | undefined;
  readonly status?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize ListSolutions command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListSolutionsCommand/
 */
export interface SimListSolutionsCommand {
  readonly input?: SimListSolutionsCommandInput | undefined;
}

export interface SimListSolutionsCommandInput {
  readonly datasetGroupArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListSolutionsCommandOutput {
  readonly solutions?: readonly SimPersonalizeSolutionSummary[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteSolution command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteSolutionCommand/
 */
export interface SimDeleteSolutionCommand {
  readonly input: SimDeleteSolutionCommandInput;
}

export interface SimDeleteSolutionCommandInput {
  readonly solutionArn?: string | undefined;
}

export interface SimDeleteSolutionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize CreateSolutionVersion command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateSolutionVersionCommand/
 */
export interface SimCreateSolutionVersionCommand {
  readonly input: SimCreateSolutionVersionCommandInput;
}

export interface SimCreateSolutionVersionCommandInput {
  readonly name?: string | undefined;
  readonly solutionArn?: string | undefined;
  readonly trainingMode?: string | undefined;
}

export interface SimCreateSolutionVersionCommandOutput {
  readonly solutionVersionArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A solution version as Describe reports it.
 */
export interface SimPersonalizeSolutionVersionDetail {
  readonly name?: string | undefined;
  readonly solutionVersionArn?: string | undefined;
  readonly solutionArn?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly trainingMode?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * A solution version as List reports it.
 */
export interface SimPersonalizeSolutionVersionSummary {
  readonly solutionVersionArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeSolutionVersion command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeSolutionVersionCommand/
 */
export interface SimDescribeSolutionVersionCommand {
  readonly input: SimDescribeSolutionVersionCommandInput;
}

export interface SimDescribeSolutionVersionCommandInput {
  readonly solutionVersionArn?: string | undefined;
}

export interface SimDescribeSolutionVersionCommandOutput {
  readonly solutionVersion?: SimPersonalizeSolutionVersionDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize ListSolutionVersions command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListSolutionVersionsCommand/
 */
export interface SimListSolutionVersionsCommand {
  readonly input?: SimListSolutionVersionsCommandInput | undefined;
}

export interface SimListSolutionVersionsCommandInput {
  readonly solutionArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListSolutionVersionsCommandOutput {
  readonly solutionVersions?:
    | readonly SimPersonalizeSolutionVersionSummary[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

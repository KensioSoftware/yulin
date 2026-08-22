import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimPersonalizeTag } from "../dataset-group/dataset-group.command.js";

/**
 * The configuration of a recommender, as a request gives it and Describe
 * reports it back.
 *
 * `itemExplorationConfig` carries `explorationWeight` and
 * `explorationItemAgeCutOff` as strings, which is how real Personalize takes
 * them.
 */
export interface SimPersonalizeRecommenderConfiguration {
  readonly itemExplorationConfig?: Record<string, string> | undefined;
  readonly minRecommendationRequestsPerSecond?: number | undefined;
  readonly enableMetadataWithRecommendations?: boolean | undefined;
}

/**
 * Minimal structural sim Personalize CreateRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateRecommenderCommand/
 */
export interface SimCreateRecommenderCommand {
  readonly input: SimCreateRecommenderCommandInput;
}

export interface SimCreateRecommenderCommandInput {
  readonly name?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly recommenderConfig?:
    | SimPersonalizeRecommenderConfiguration
    | undefined;
  readonly tags?: readonly SimPersonalizeTag[] | undefined;
}

export interface SimCreateRecommenderCommandOutput {
  readonly recommenderArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A recommender as Describe reports it.
 */
export interface SimPersonalizeRecommenderDetail {
  readonly name?: string | undefined;
  readonly recommenderArn?: string | undefined;
  readonly datasetGroupArn?: string | undefined;
  readonly recipeArn?: string | undefined;
  readonly recommenderConfig?:
    | SimPersonalizeRecommenderConfiguration
    | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeRecommenderCommand/
 */
export interface SimDescribeRecommenderCommand {
  readonly input: SimDescribeRecommenderCommandInput;
}

export interface SimDescribeRecommenderCommandInput {
  readonly recommenderArn?: string | undefined;
}

export interface SimDescribeRecommenderCommandOutput {
  readonly recommender?: SimPersonalizeRecommenderDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize ListRecommenders command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListRecommendersCommand/
 */
export interface SimListRecommendersCommand {
  readonly input?: SimListRecommendersCommandInput | undefined;
}

export interface SimListRecommendersCommandInput {
  readonly datasetGroupArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListRecommendersCommandOutput {
  readonly recommenders?:
    | readonly SimPersonalizeRecommenderDetail[]
    | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize UpdateRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/UpdateRecommenderCommand/
 */
export interface SimUpdateRecommenderCommand {
  readonly input: SimUpdateRecommenderCommandInput;
}

export interface SimUpdateRecommenderCommandInput {
  readonly recommenderArn?: string | undefined;
  readonly recommenderConfig?:
    | SimPersonalizeRecommenderConfiguration
    | undefined;
}

export interface SimUpdateRecommenderCommandOutput {
  readonly recommenderArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteRecommenderCommand/
 */
export interface SimDeleteRecommenderCommand {
  readonly input: SimDeleteRecommenderCommandInput;
}

export interface SimDeleteRecommenderCommandInput {
  readonly recommenderArn?: string | undefined;
}

export interface SimDeleteRecommenderCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize StartRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/StartRecommenderCommand/
 */
export interface SimStartRecommenderCommand {
  readonly input: SimStartRecommenderCommandInput;
}

export interface SimStartRecommenderCommandInput {
  readonly recommenderArn?: string | undefined;
}

export interface SimStartRecommenderCommandOutput {
  readonly recommenderArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize StopRecommender command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/StopRecommenderCommand/
 */
export interface SimStopRecommenderCommand {
  readonly input: SimStopRecommenderCommandInput;
}

export interface SimStopRecommenderCommandInput {
  readonly recommenderArn?: string | undefined;
}

export interface SimStopRecommenderCommandOutput {
  readonly recommenderArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

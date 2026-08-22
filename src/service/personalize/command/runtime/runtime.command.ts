import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One item a runtime call answers with.
 *
 * A score is reported only where the declaration carried one. Real
 * Personalize scores every item it returns, from the model behind the
 * campaign, and simulated Personalize has no model to score from.
 */
export interface SimPersonalizePredictedItem {
  readonly itemId?: string | undefined;
  readonly score?: number | undefined;
}

/**
 * Minimal structural sim Personalize Runtime GetRecommendations command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize-runtime/command/GetRecommendationsCommand/
 */
export interface SimGetRecommendationsCommand {
  readonly input: SimGetRecommendationsCommandInput;
}

export interface SimGetRecommendationsCommandInput {
  readonly campaignArn?: string | undefined;
  readonly recommenderArn?: string | undefined;
  readonly itemId?: string | undefined;
  readonly userId?: string | undefined;
  readonly numResults?: number | undefined;
}

export interface SimGetRecommendationsCommandOutput {
  readonly itemList?: readonly SimPersonalizePredictedItem[] | undefined;
  readonly recommendationId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize Runtime GetPersonalizedRanking command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize-runtime/command/GetPersonalizedRankingCommand/
 */
export interface SimGetPersonalizedRankingCommand {
  readonly input: SimGetPersonalizedRankingCommandInput;
}

export interface SimGetPersonalizedRankingCommandInput {
  readonly campaignArn?: string | undefined;
  readonly inputList?: readonly string[] | undefined;
  readonly userId?: string | undefined;
}

export interface SimGetPersonalizedRankingCommandOutput {
  readonly personalizedRanking?:
    | readonly SimPersonalizePredictedItem[]
    | undefined;
  readonly recommendationId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

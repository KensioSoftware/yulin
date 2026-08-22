import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import type { SimPersonalizeRecommendationRequest } from "../../recommendation/sim-personalize-recommendations.js";
import type { SimPersonalizeRecommender } from "../../resource/sim-personalize-recommender.js";
import type { SimPersonalizeUseCaseParameter } from "../../resource/sim-personalize-use-case.js";
import type { SimGetRecommendationsCommandInput } from "./runtime.command.js";

/**
 * What one request is answered from, once the resource it names is resolved.
 */
export interface SimPersonalizeRecommendationSource {
  readonly arn: string;
  readonly request: SimPersonalizeRecommendationRequest;
}

/**
 * Read the one resource a GetRecommendations request names.
 *
 * Real Personalize takes a `campaignArn` on the custom path and a
 * `recommenderArn` on the domain path, and a request has to carry exactly one
 * of them.
 */
export function requireSimPersonalizeRecommendationArn(
  input: SimGetRecommendationsCommandInput,
): {
  readonly campaignArn: string | undefined;
  readonly recommenderArn: string | undefined;
} {
  const { campaignArn, recommenderArn } = input;

  if (campaignArn !== undefined && recommenderArn !== undefined) {
    throw new SimPersonalizeInvalidInputException(
      "GetRecommendations takes a campaignArn or a recommenderArn, not both",
    );
  }

  if (campaignArn === undefined && recommenderArn === undefined) {
    throw new SimPersonalizeInvalidInputException(
      "GetRecommendations needs a campaignArn or a recommenderArn",
    );
  }

  return { campaignArn, recommenderArn };
}

/**
 * The request one recommender's use case is answered from, refusing a request
 * missing what that use case needs.
 *
 * This is the part of the domain path worth simulating. `Top picks for you`
 * needs a user and `More like X` needs both a user and an item, and real
 * Personalize refuses a request that leaves one out.
 *
 * A parameter the use case is documented as not using is dropped rather than
 * matched on. Real Personalize ignores it, and matching an item rule for a use
 * case that recommends from the user alone would answer here from a rule AWS
 * would never have reached.
 */
export function simPersonalizeUseCaseRequest(
  recommender: SimPersonalizeRecommender,
  input: SimGetRecommendationsCommandInput,
): SimPersonalizeRecommendationRequest {
  const { useCase } = recommender;

  return {
    itemId: read(useCase.itemId, input.itemId, "itemId", recommender),
    userId: read(useCase.userId, input.userId, "userId", recommender),
  };
}

function read(
  parameter: SimPersonalizeUseCaseParameter,
  value: string | undefined,
  named: string,
  recommender: SimPersonalizeRecommender,
): string | undefined {
  if (parameter === "unused") {
    return undefined;
  }

  if (parameter === "optional" || (value !== undefined && value !== "")) {
    return value;
  }

  throw new SimPersonalizeInvalidInputException(
    `GetRecommendations needs a ${named} for the recommender ` +
      `'${recommender.arn}'. Its use case is ${recommender.useCase.name} ` +
      `(${recommender.recipeArn}).`,
  );
}

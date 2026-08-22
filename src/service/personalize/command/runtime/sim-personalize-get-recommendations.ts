import { simPersonalizeItemList } from "../../view/sim-personalize-item-list-view.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimGetRecommendationsCommand,
  SimGetRecommendationsCommandInput,
  SimGetRecommendationsCommandOutput,
} from "./runtime.command.js";
import {
  requireSimPersonalizeRecommendationArn,
  simPersonalizeUseCaseRequest,
  type SimPersonalizeRecommendationSource,
} from "./sim-personalize-recommendation-target.js";
import { SimPersonalizeRuntimeCommandGroup } from "./sim-personalize-runtime-command-group.js";
import { requireSimPersonalizeResultCount } from "./sim-personalize-runtime-input.js";

const action = "personalize:GetRecommendations";

const accepted = [
  "campaignArn",
  "recommenderArn",
  "itemId",
  "userId",
  "numResults",
];

const unsimulated = new SimPersonalizeUnsimulatedInput("GetRecommendations");

/**
 * Handles a GetRecommendations command.
 *
 * The recommendations come from what is declared against the campaign or the
 * recommender the request names, and nothing else is read. An item rule
 * answers a request carrying an item, a user rule answers one carrying a user,
 * and a request matching neither is answered with the default.
 *
 * A recommender narrows that first. Its use case decides which parameters the
 * request has to carry and which ones real Personalize would read, so a
 * `Top picks for you` request is answered from its user even where it carries
 * an item as well.
 */
export class SimPersonalizeGetRecommendationsHandler extends SimPersonalizeRuntimeCommandGroup {
  /**
   * Recommend the items a campaign or a recommender is declared to recommend.
   */
  handle(
    command: SimGetRecommendationsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimGetRecommendationsCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const resultCount = requireSimPersonalizeResultCount(input.numResults);
    const source = this.source(input, options);
    const declared = this.rules
      .recommendations(source.arn)
      .itemsFor(source.request);

    return {
      itemList: simPersonalizeItemList(declared.itemIds).slice(0, resultCount),
      recommendationId: declared.recommendationId,
      $metadata: {},
    };
  }

  private source(
    input: SimGetRecommendationsCommandInput,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeRecommendationSource {
    const { recommenderArn } = requireSimPersonalizeRecommendationArn(input);

    if (recommenderArn === undefined) {
      return {
        arn: this.campaign(input.campaignArn, action, options).arn,
        request: { itemId: input.itemId, userId: input.userId },
      };
    }

    const recommender = this.recommender(recommenderArn, action, options);

    return {
      arn: recommender.arn,
      request: simPersonalizeUseCaseRequest(recommender, input),
    };
  }
}

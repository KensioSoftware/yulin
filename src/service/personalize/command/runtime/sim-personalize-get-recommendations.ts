import { simPersonalizeItemList } from "../../view/sim-personalize-item-list-view.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimGetRecommendationsCommand,
  SimGetRecommendationsCommandOutput,
} from "./runtime.command.js";
import { SimPersonalizeRuntimeCommandGroup } from "./sim-personalize-runtime-command-group.js";
import { requireSimPersonalizeResultCount } from "./sim-personalize-runtime-input.js";

const action = "personalize:GetRecommendations";

const accepted = ["campaignArn", "itemId", "userId", "numResults"];

const unsimulated = new SimPersonalizeUnsimulatedInput("GetRecommendations");

/**
 * Handles a GetRecommendations command.
 *
 * The recommendations come from what is declared against the campaign the
 * request names, and nothing else is read. An item rule answers a request
 * carrying an item, a user rule answers one carrying a user, and a request
 * matching neither is answered with the campaign's default.
 */
export class SimPersonalizeGetRecommendationsHandler extends SimPersonalizeRuntimeCommandGroup {
  /**
   * Recommend the items a campaign is declared to recommend.
   */
  handle(
    command: SimGetRecommendationsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimGetRecommendationsCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const campaign = this.campaign(input.campaignArn, action, options);
    const resultCount = requireSimPersonalizeResultCount(input.numResults);
    const declared = this.rules
      .recommendations(campaign.arn)
      .itemsFor({ itemId: input.itemId, userId: input.userId });

    return {
      itemList: simPersonalizeItemList(declared.itemIds).slice(0, resultCount),
      recommendationId: declared.recommendationId,
      $metadata: {},
    };
  }
}

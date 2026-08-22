import {
  simPersonalizeItemList,
  simPersonalizeRankedInputList,
} from "../../view/sim-personalize-item-list-view.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimGetPersonalizedRankingCommand,
  SimGetPersonalizedRankingCommandOutput,
} from "./runtime.command.js";
import { SimPersonalizeRuntimeCommandGroup } from "./sim-personalize-runtime-command-group.js";
import {
  requireSimPersonalizeInputList,
  requireSimPersonalizeUserId,
} from "./sim-personalize-runtime-input.js";

const action = "personalize:GetPersonalizedRanking";

const accepted = ["campaignArn", "inputList", "userId"];

const unsimulated = new SimPersonalizeUnsimulatedInput(
  "GetPersonalizedRanking",
);

/**
 * Handles a GetPersonalizedRanking command.
 *
 * A user rule declared against the campaign says what order the items come
 * back in. Where no rule matches, the request's own list comes back in the
 * order it arrived, so a test that is not about the ranking still gets a
 * stable answer.
 */
export class SimPersonalizeGetPersonalizedRankingHandler extends SimPersonalizeRuntimeCommandGroup {
  /**
   * Rank the items a request carries as the campaign is declared to rank them.
   */
  handle(
    command: SimGetPersonalizedRankingCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimGetPersonalizedRankingCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const campaign = this.campaign(input.campaignArn, action, options);
    const inputList = requireSimPersonalizeInputList(input.inputList);
    const userId = requireSimPersonalizeUserId(input.userId);
    const declared = this.rules.rankings(campaign.arn).itemsFor(userId);

    return {
      personalizedRanking:
        declared === undefined
          ? simPersonalizeRankedInputList(inputList)
          : simPersonalizeItemList(declared.itemIds),
      recommendationId: declared?.recommendationId,
      $metadata: {},
    };
  }
}

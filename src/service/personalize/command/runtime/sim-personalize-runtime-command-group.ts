import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import type { SimPersonalizeResultRules } from "../../recommendation/sim-personalize-result-rules.js";
import type { SimPersonalizeCampaign } from "../../resource/sim-personalize-campaign.js";
import type { SimPersonalizeRecommender } from "../../resource/sim-personalize-recommender.js";
import {
  SimPersonalizeCommandGroup,
  type SimPersonalizeCommandGroupProperties,
} from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";

export interface SimPersonalizeRuntimeCommandGroupProperties extends SimPersonalizeCommandGroupProperties {
  readonly rules: SimPersonalizeResultRules;
}

/**
 * What both simulated Personalize Runtime command handlers are built over.
 *
 * A runtime request names a campaign or a recommender and is answered from
 * what is declared against it, so both handlers read the same rules. Only
 * `GetRecommendations` reaches a recommender. `GetPersonalizedRanking` names a
 * campaign and has no recommender form.
 */
export abstract class SimPersonalizeRuntimeCommandGroup extends SimPersonalizeCommandGroup {
  protected readonly rules: SimPersonalizeResultRules;

  constructor(properties: SimPersonalizeRuntimeCommandGroupProperties) {
    super(properties);
    this.rules = properties.rules;
  }

  /**
   * Read the campaign a runtime request names, authorizing against it first.
   *
   * A campaign ARN naming nothing is a missing resource, which is what real
   * Personalize Runtime calls it too.
   */
  protected campaign(
    campaignArn: string | undefined,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeCampaign {
    return this.resolve(this.resources.campaigns, campaignArn, action, options);
  }

  /**
   * Read the recommender a runtime request names, refusing a stopped one.
   *
   * A stopped recommender serves nothing on real Personalize and costs
   * nothing. Reporting it as missing would send a reader looking for a
   * resource that is still there, so the refusal names the state and the way
   * out of it.
   */
  protected recommender(
    recommenderArn: string,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeRecommender {
    const recommender = this.resolve(
      this.resources.recommenders,
      recommenderArn,
      action,
      options,
    );

    if (recommender.active) {
      return recommender;
    }

    throw new SimPersonalizeInvalidInputException(
      `The recommender '${recommender.arn}' is ${recommender.status} and ` +
        `serves no recommendations. Start it with StartRecommender.`,
    );
  }
}

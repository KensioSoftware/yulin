import type { SimPersonalizeCampaign } from "../resource/sim-personalize-campaign.js";
import type { SimPersonalizeResourceStore } from "../resource/sim-personalize-resource-store.js";
import { requireSimPersonalizeDeclaredCampaign } from "./sim-personalize-declared-campaign.js";
import { SimPersonalizeRankings } from "./sim-personalize-rankings.js";
import { SimPersonalizeRecommendations } from "./sim-personalize-recommendations.js";

export interface SimPersonalizeCampaignRulesProperties {
  readonly campaigns: SimPersonalizeResourceStore<SimPersonalizeCampaign>;
}

/**
 * What one campaign answers the two runtime operations with.
 *
 * The campaign it was declared against is held with it. A campaign deleted and
 * created again under the same name is a new campaign at the same ARN, and it
 * starts with nothing declared against it.
 */
interface SimPersonalizeCampaignRuleSet {
  readonly campaign: SimPersonalizeCampaign;
  readonly recommendations: SimPersonalizeRecommendations;
  readonly rankings: SimPersonalizeRankings;
}

/**
 * The results declared against the campaigns of one simulated Personalize.
 *
 * Rules are held per campaign because that is the resource real Personalize
 * answers a runtime call from. A campaign serves one solution version trained
 * on one recipe, so two campaigns in a dataset group answer the same item
 * differently, and rules that sat on the service would have to pretend
 * otherwise.
 *
 * A campaign is required to exist before anything is declared against it.
 */
export class SimPersonalizeCampaignRules {
  private readonly campaigns: SimPersonalizeResourceStore<SimPersonalizeCampaign>;
  private readonly byCampaignArn = new Map<
    string,
    SimPersonalizeCampaignRuleSet
  >();

  constructor(properties: SimPersonalizeCampaignRulesProperties) {
    this.campaigns = properties.campaigns;
  }

  /**
   * The recommendations one campaign answers GetRecommendations with.
   */
  recommendations(campaignArn: string): SimPersonalizeRecommendations {
    return this.declaredAgainst(campaignArn).recommendations;
  }

  /**
   * The rankings one campaign answers GetPersonalizedRanking with.
   */
  rankings(campaignArn: string): SimPersonalizeRankings {
    return this.declaredAgainst(campaignArn).rankings;
  }

  private declaredAgainst(campaignArn: string): SimPersonalizeCampaignRuleSet {
    const campaign = requireSimPersonalizeDeclaredCampaign(
      this.campaigns,
      campaignArn,
    );
    const held = this.byCampaignArn.get(campaignArn);

    if (held?.campaign === campaign) {
      return held;
    }

    const declared = {
      campaign,
      recommendations: new SimPersonalizeRecommendations(),
      rankings: new SimPersonalizeRankings(),
    };

    this.byCampaignArn.set(campaignArn, declared);

    return declared;
  }
}

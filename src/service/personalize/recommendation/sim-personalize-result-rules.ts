import type { SimPersonalizeResource } from "../resource/sim-personalize-resource.js";
import {
  requireSimPersonalizeRankingTarget,
  requireSimPersonalizeRecommendationTarget,
  type SimPersonalizeDeclarationTargets,
} from "./sim-personalize-declared-target.js";
import { SimPersonalizeRankings } from "./sim-personalize-rankings.js";
import { SimPersonalizeRecommendations } from "./sim-personalize-recommendations.js";

/**
 * What one campaign or recommender answers the runtime operations with.
 *
 * The resource it was declared against is held with it. A campaign deleted and
 * created again under the same name is a new campaign at the same ARN, and it
 * starts with nothing declared against it.
 */
interface SimPersonalizeRuleSet {
  readonly target: SimPersonalizeResource;
  readonly recommendations: SimPersonalizeRecommendations;
  readonly rankings: SimPersonalizeRankings;
}

/**
 * The results declared against the campaigns and recommenders of one simulated
 * Personalize.
 *
 * Rules are held per resource because that is what real Personalize answers a
 * runtime call from. A campaign serves one solution version trained on one
 * recipe and a recommender serves one use case, so two of them answer the same
 * item differently, and rules that sat on the service would have to pretend
 * otherwise.
 *
 * The resource has to exist before anything is declared against it.
 */
export class SimPersonalizeResultRules {
  private readonly targets: SimPersonalizeDeclarationTargets;
  private readonly byArn = new Map<string, SimPersonalizeRuleSet>();

  constructor(targets: SimPersonalizeDeclarationTargets) {
    this.targets = targets;
  }

  /**
   * The recommendations one campaign or recommender answers
   * GetRecommendations with.
   */
  recommendations(arn: string): SimPersonalizeRecommendations {
    return this.declaredAgainst(
      arn,
      requireSimPersonalizeRecommendationTarget(this.targets, arn),
    ).recommendations;
  }

  /**
   * The rankings one campaign answers GetPersonalizedRanking with.
   */
  rankings(campaignArn: string): SimPersonalizeRankings {
    return this.declaredAgainst(
      campaignArn,
      requireSimPersonalizeRankingTarget(this.targets, campaignArn),
    ).rankings;
  }

  private declaredAgainst(
    arn: string,
    target: SimPersonalizeResource,
  ): SimPersonalizeRuleSet {
    const held = this.byArn.get(arn);

    if (held?.target === target) {
      return held;
    }

    const declared = {
      target,
      recommendations: new SimPersonalizeRecommendations(),
      rankings: new SimPersonalizeRankings(),
    };

    this.byArn.set(arn, declared);

    return declared;
  }
}

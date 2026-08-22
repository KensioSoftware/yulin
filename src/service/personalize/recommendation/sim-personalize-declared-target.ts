import { SimPersonalizeDeclarationError } from "../error/sim-personalize.error.js";
import type { SimPersonalizeCampaign } from "../resource/sim-personalize-campaign.js";
import type { SimPersonalizeRecommender } from "../resource/sim-personalize-recommender.js";
import type { SimPersonalizeResource } from "../resource/sim-personalize-resource.js";
import type { SimPersonalizeResourceStore } from "../resource/sim-personalize-resource-store.js";

/**
 * The stores a declaration is resolved against.
 *
 * Both, because the two paths reach the runtime through different resources.
 * A custom dataset group serves through a campaign, and a Domain dataset group
 * serves through a recommender.
 */
export interface SimPersonalizeDeclarationTargets {
  readonly campaigns: SimPersonalizeResourceStore<SimPersonalizeCampaign>;
  readonly recommenders: SimPersonalizeResourceStore<SimPersonalizeRecommender>;
}

/**
 * Read the campaign or recommender a recommendation is declared against.
 *
 * The refusal is what makes a mistyped ARN visible. A declaration left against
 * an ARN nothing holds would go unanswered, and the empty item list the runtime
 * came back with would read as the system under test asking for the wrong item.
 */
export function requireSimPersonalizeRecommendationTarget(
  targets: SimPersonalizeDeclarationTargets,
  arn: string,
): SimPersonalizeResource {
  const found = targets.campaigns.find(arn) ?? targets.recommenders.find(arn);

  if (found === undefined) {
    throw new SimPersonalizeDeclarationError(
      `No simulated Personalize campaign or recommender is deployed at ` +
        `'${arn}'. Recommendations are declared against the resource a ` +
        `runtime call names, so that resource is created first.`,
    );
  }

  return found;
}

/**
 * Read the campaign a ranking is declared against.
 *
 * Rankings are campaigns only. `GetPersonalizedRanking` takes a `campaignArn`
 * and has no recommender form, and the domain use cases all recommend rather
 * than rank, so a recommender ARN here is told what it is missing.
 */
export function requireSimPersonalizeRankingTarget(
  targets: SimPersonalizeDeclarationTargets,
  arn: string,
): SimPersonalizeCampaign {
  const campaign = targets.campaigns.find(arn);

  if (campaign !== undefined) {
    return campaign;
  }

  if (targets.recommenders.find(arn) !== undefined) {
    throw new SimPersonalizeDeclarationError(
      `'${arn}' is a simulated Personalize recommender, and rankings are ` +
        `declared against a campaign. GetPersonalizedRanking takes a ` +
        `campaignArn and has no recommender form.`,
    );
  }

  throw new SimPersonalizeDeclarationError(
    `No simulated Personalize campaign is deployed at '${arn}'. Rankings are ` +
      `declared against the campaign a runtime call names, so the campaign ` +
      `is created first.`,
  );
}

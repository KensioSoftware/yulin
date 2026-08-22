import type { SimPersonalizeDomain } from "./sim-personalize-domain.js";

/**
 * One domain use case a recommender can be created for.
 *
 * A use case is a recipe AWS trained and tuned for one job, and it decides
 * what a `GetRecommendations` request has to carry. That is the whole of what
 * the use case does here. No model is fitted, and what a recommender answers
 * with is declared against it.
 */
export interface SimPersonalizeUseCase {
  /** The recipe ARN `CreateRecommender` names the use case by. */
  readonly recipeArn: string;

  /** What AWS calls it, e.g. `Top picks for you`. */
  readonly name: string;

  /** The dataset group domain this use case belongs to. */
  readonly domain: SimPersonalizeDomain;

  /** Whether `GetRecommendations` has to carry an `itemId`. */
  readonly requiresItemId: boolean;

  /** Whether `GetRecommendations` has to carry a `userId`. */
  readonly requiresUserId: boolean;
}

function useCase(
  recipe: string,
  name: string,
  domain: SimPersonalizeDomain,
  requires: { readonly itemId?: boolean; readonly userId?: boolean },
): SimPersonalizeUseCase {
  return {
    recipeArn: `arn:aws:personalize:::recipe/${recipe}`,
    name,
    domain,
    requiresItemId: requires.itemId ?? false,
    requiresUserId: requires.userId ?? false,
  };
}

/**
 * The ten domain use cases, five per domain.
 *
 * The requirements are the ones AWS documents against each use case. Every one
 * of them requires a `userId` except the two that ask for items like a given
 * item, because the rest filter out what the user has already watched or
 * bought, and that filtering is keyed on the user.
 *
 * `Frequently bought together` and `More like X` take a `userId` on real
 * Personalize only to apply a `CurrentUser` filter. Filters are not simulated
 * here, so a request to either of them is answered from its item alone.
 *
 * https://docs.aws.amazon.com/personalize/latest/dg/ECOMMERCE-use-cases.html
 * https://docs.aws.amazon.com/personalize/latest/dg/VIDEO-ON-DEMAND-use-cases.html
 */
export const simPersonalizeUseCases: readonly SimPersonalizeUseCase[] = [
  useCase("aws-vod-most-popular", "Most popular", "VIDEO_ON_DEMAND", {
    userId: true,
  }),
  useCase("aws-vod-trending-now", "Trending now", "VIDEO_ON_DEMAND", {
    userId: true,
  }),
  useCase("aws-vod-top-picks", "Top picks for you", "VIDEO_ON_DEMAND", {
    userId: true,
  }),
  useCase("aws-vod-more-like-x", "More like X", "VIDEO_ON_DEMAND", {
    itemId: true,
  }),
  useCase(
    "aws-vod-because-you-watched-x",
    "Because you watched X",
    "VIDEO_ON_DEMAND",
    { itemId: true, userId: true },
  ),
  useCase("aws-ecomm-popular-items-by-views", "Most viewed", "ECOMMERCE", {
    userId: true,
  }),
  useCase("aws-ecomm-popular-items-by-purchases", "Best sellers", "ECOMMERCE", {
    userId: true,
  }),
  useCase("aws-ecomm-recommended-for-you", "Recommended for you", "ECOMMERCE", {
    userId: true,
  }),
  useCase(
    "aws-ecomm-frequently-bought-together",
    "Frequently bought together",
    "ECOMMERCE",
    { itemId: true },
  ),
  useCase(
    "aws-ecomm-customers-who-viewed-x-also-viewed",
    "Customers who viewed X also viewed",
    "ECOMMERCE",
    { itemId: true, userId: true },
  ),
];

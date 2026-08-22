import type { SimPersonalizeDomain } from "./sim-personalize-domain.js";

/**
 * What one use case does with one `GetRecommendations` parameter.
 *
 * `required` is refused when it is missing. `optional` is read where the
 * request carries it. `unused` is ignored, which is what AWS documents as
 * "Not used".
 *
 * The three states are the ones the AWS tables draw. `Trending now` and
 * `Frequently bought together` take a `userId` only to filter by `CurrentUser`
 * or by what the user has already interacted with, and both are `optional`
 * here for that reason.
 */
export type SimPersonalizeUseCaseParameter = "required" | "optional" | "unused";

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

  /** What it does with the `itemId` of a request. */
  readonly itemId: SimPersonalizeUseCaseParameter;

  /** What it does with the `userId` of a request. */
  readonly userId: SimPersonalizeUseCaseParameter;
}

function useCase(
  recipe: string,
  name: string,
  domain: SimPersonalizeDomain,
  itemId: SimPersonalizeUseCaseParameter,
  userId: SimPersonalizeUseCaseParameter,
): SimPersonalizeUseCase {
  return {
    recipeArn: `arn:aws:personalize:::recipe/${recipe}`,
    name,
    domain,
    itemId,
    userId,
  };
}

/**
 * The ten domain use cases, five per domain, with what AWS documents against
 * each one under "GetRecommendations requirements".
 *
 * Nearly all of them require a `userId`, because they filter out what the user
 * has already watched or bought and that filtering is keyed on the user.
 * `Trending now` and `Frequently bought together` are the two that do not.
 *
 * https://docs.aws.amazon.com/personalize/latest/dg/ECOMMERCE-use-cases.html
 * https://docs.aws.amazon.com/personalize/latest/dg/VIDEO_ON_DEMAND-use-cases.html
 */
export const simPersonalizeUseCases: readonly SimPersonalizeUseCase[] = [
  useCase(
    "aws-vod-most-popular",
    "Most popular",
    "VIDEO_ON_DEMAND",
    "unused",
    "required",
  ),
  useCase(
    "aws-vod-trending-now",
    "Trending now",
    "VIDEO_ON_DEMAND",
    "unused",
    "optional",
  ),
  useCase(
    "aws-vod-top-picks",
    "Top picks for you",
    "VIDEO_ON_DEMAND",
    "unused",
    "required",
  ),
  useCase(
    "aws-vod-more-like-x",
    "More like X",
    "VIDEO_ON_DEMAND",
    "required",
    "required",
  ),
  useCase(
    "aws-vod-because-you-watched-x",
    "Because you watched X",
    "VIDEO_ON_DEMAND",
    "required",
    "required",
  ),
  useCase(
    "aws-ecomm-popular-items-by-views",
    "Most viewed",
    "ECOMMERCE",
    "unused",
    "required",
  ),
  useCase(
    "aws-ecomm-popular-items-by-purchases",
    "Best sellers",
    "ECOMMERCE",
    "unused",
    "required",
  ),
  useCase(
    "aws-ecomm-recommended-for-you",
    "Recommended for you",
    "ECOMMERCE",
    "unused",
    "required",
  ),
  useCase(
    "aws-ecomm-frequently-bought-together",
    "Frequently bought together",
    "ECOMMERCE",
    "required",
    "optional",
  ),
  useCase(
    "aws-ecomm-customers-who-viewed-x-also-viewed",
    "Customers who viewed X also viewed",
    "ECOMMERCE",
    "required",
    "required",
  ),
];

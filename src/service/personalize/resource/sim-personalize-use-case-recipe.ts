import { SimPersonalizeInvalidInputException } from "../error/sim-personalize.error.js";
import type { SimPersonalizeDomain } from "./sim-personalize-domain.js";
import {
  simPersonalizeUseCases,
  type SimPersonalizeUseCase,
} from "./sim-personalize-use-case.js";

const byRecipeArn = new Map(
  simPersonalizeUseCases.map((entry) => [entry.recipeArn, entry]),
);

/**
 * Read the use case a recommender is being created for, refusing a recipe that
 * is not one of the ten or belongs to the other domain.
 *
 * A custom recipe such as `aws-similar-items` reaches the first refusal. Real
 * Personalize refuses it too, since a recommender is the domain path and a
 * custom recipe belongs to a solution.
 */
export function requireSimPersonalizeUseCase(
  recipeArn: string | undefined,
  domain: SimPersonalizeDomain,
): SimPersonalizeUseCase {
  if (recipeArn === undefined || recipeArn === "") {
    throw new SimPersonalizeInvalidInputException(
      "A recommender needs a recipe ARN naming one of the domain use cases",
    );
  }

  const found = byRecipeArn.get(recipeArn);

  if (found === undefined) {
    throw new SimPersonalizeInvalidInputException(
      `'${recipeArn}' is not a Personalize domain use case recipe. A ` +
        `recommender is created for one of the ten use cases, and a custom ` +
        `recipe belongs to a solution.`,
    );
  }

  if (found.domain !== domain) {
    throw new SimPersonalizeInvalidInputException(
      `'${recipeArn}' is a ${found.domain} use case, and the dataset group ` +
        `is a ${domain} domain dataset group.`,
    );
  }

  return found;
}

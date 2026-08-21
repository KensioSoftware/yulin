import type {
  SimPersonalizeSolutionSummary,
  SimPersonalizeSolutionVersionDetail,
  SimPersonalizeSolutionVersionSummary,
} from "../command/solution/solution.command.js";
import type { SimPersonalizeSolutionVersion } from "../resource/sim-personalize-solution-version.js";
import type { SimPersonalizeSolution } from "../resource/sim-personalize-solution.js";

/**
 * A solution as List reports it.
 */
export function simPersonalizeSolutionSummary(
  solution: SimPersonalizeSolution,
): SimPersonalizeSolutionSummary {
  return {
    name: solution.name,
    solutionArn: solution.arn,
    status: solution.status,
    recipeArn: solution.recipeArn,
    creationDateTime: solution.creationDateTime,
    lastUpdatedDateTime: solution.lastUpdatedDateTime,
  };
}

/**
 * A solution version as List reports it, and as a solution names its latest.
 */
export function simPersonalizeSolutionVersionSummary(
  version: SimPersonalizeSolutionVersion,
): SimPersonalizeSolutionVersionSummary {
  return {
    solutionVersionArn: version.arn,
    status: version.status,
    creationDateTime: version.creationDateTime,
    lastUpdatedDateTime: version.lastUpdatedDateTime,
  };
}

/**
 * A solution version as Describe reports it, which reaches through to the
 * solution for the dataset group and the recipe.
 */
export function simPersonalizeSolutionVersionDetail(
  version: SimPersonalizeSolutionVersion,
  solution: SimPersonalizeSolution | undefined,
): SimPersonalizeSolutionVersionDetail {
  return {
    ...simPersonalizeSolutionVersionSummary(version),
    name: version.name,
    solutionArn: version.solutionArn,
    datasetGroupArn: solution?.datasetGroupArn,
    recipeArn: solution?.recipeArn,
    trainingMode: version.trainingMode,
  };
}

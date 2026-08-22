import type { SimPersonalizeRecommenderDetail } from "../command/recommender/recommender.command.js";
import type { SimPersonalizeRecommender } from "../resource/sim-personalize-recommender.js";

/**
 * A recommender as Describe and List report it.
 *
 * Real Personalize reports the same fields from both, unlike the dataset group
 * and the dataset, whose summaries leave things out.
 */
export function simPersonalizeRecommenderDetail(
  recommender: SimPersonalizeRecommender,
): SimPersonalizeRecommenderDetail {
  return {
    name: recommender.name,
    recommenderArn: recommender.arn,
    datasetGroupArn: recommender.datasetGroupArn,
    recipeArn: recommender.recipeArn,
    recommenderConfig: recommender.recommenderConfig,
    status: recommender.status,
    creationDateTime: recommender.creationDateTime,
    lastUpdatedDateTime: recommender.lastUpdatedDateTime,
  };
}

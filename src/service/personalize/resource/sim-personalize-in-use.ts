import { SimPersonalizeResourceInUseException } from "../error/sim-personalize.error.js";
import type { SimPersonalizeResources } from "./sim-personalize-resources.js";
import type { SimPersonalizeSolutionVersion } from "./sim-personalize-solution-version.js";

/**
 * The rules real Personalize applies before it lets a resource be deleted.
 *
 * They live together because they are one idea. A resource other resources
 * still point at is reported as in use, and the message names what holds it so
 * a caller knows what to delete first.
 */
function refuse(arn: string, count: number, holders: string): never {
  throw new SimPersonalizeResourceInUseException(
    `'${arn}' still has ${count} ${holders}. Delete them first.`,
  );
}

/**
 * Refuse a dataset group that still holds datasets, solutions, recommenders or
 * an event tracker.
 */
export function requireDatasetGroupEmpty(
  resources: SimPersonalizeResources,
  datasetGroupArn: string,
): void {
  const datasets = resources.datasets.all.filter(
    (dataset) => dataset.datasetGroupArn === datasetGroupArn,
  );

  if (datasets.length > 0) {
    refuse(datasetGroupArn, datasets.length, "dataset(s) in it");
  }

  const solutions = resources.solutions.all.filter(
    (solution) => solution.datasetGroupArn === datasetGroupArn,
  );

  if (solutions.length > 0) {
    refuse(datasetGroupArn, solutions.length, "solution(s) in it");
  }

  const recommenders = resources.recommenders.all.filter(
    (recommender) => recommender.datasetGroupArn === datasetGroupArn,
  );

  if (recommenders.length > 0) {
    refuse(datasetGroupArn, recommenders.length, "recommender(s) on it");
  }

  const eventTrackers = resources.eventTrackers.all.filter(
    (eventTracker) => eventTracker.datasetGroupArn === datasetGroupArn,
  );

  if (eventTrackers.length > 0) {
    refuse(datasetGroupArn, eventTrackers.length, "event tracker(s) on it");
  }
}

/**
 * Refuse a schema a dataset is still associated with.
 */
export function requireSchemaUnused(
  resources: SimPersonalizeResources,
  schemaArn: string,
): void {
  const datasets = resources.datasets.all.filter(
    (dataset) => dataset.schemaArn === schemaArn,
  );

  if (datasets.length > 0) {
    refuse(schemaArn, datasets.length, "dataset(s) using it");
  }
}

/**
 * The versions of one solution, and a refusal when a campaign still deploys
 * any of them.
 *
 * Deleting a solution takes its versions with it, so the caller needs the
 * versions as well as the verdict.
 */
export function requireSolutionUndeployed(
  resources: SimPersonalizeResources,
  solutionArn: string,
): readonly SimPersonalizeSolutionVersion[] {
  const versions = resources.solutionVersions.all.filter(
    (version) => version.solutionArn === solutionArn,
  );
  const versionArns = new Set(versions.map((version) => version.arn));
  const campaigns = resources.campaigns.all.filter((campaign) =>
    versionArns.has(campaign.solutionVersionArn),
  );

  if (campaigns.length > 0) {
    refuse(solutionArn, campaigns.length, "campaign(s) deploying it");
  }

  return versions;
}

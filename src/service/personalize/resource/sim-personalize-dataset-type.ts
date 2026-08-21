import { SimPersonalizeInvalidInputException } from "../error/sim-personalize.error.js";

/**
 * The dataset types real Personalize accepts, as it stores them.
 *
 * A request names one case insensitively, and Personalize upper-cases it for
 * the dataset ARN and reports it back that way.
 *
 * https://docs.aws.amazon.com/personalize/latest/dg/API_CreateDataset.html
 */
export const simPersonalizeDatasetTypes = [
  "INTERACTIONS",
  "ITEMS",
  "USERS",
  "ACTIONS",
  "ACTION_INTERACTIONS",
] as const;

export type SimPersonalizeDatasetType =
  (typeof simPersonalizeDatasetTypes)[number];

/**
 * Read a dataset type from request input, refusing one Personalize has no
 * dataset for.
 */
export function requireSimPersonalizeDatasetType(
  datasetType: string | undefined,
): SimPersonalizeDatasetType {
  if (datasetType === undefined || datasetType === "") {
    throw new SimPersonalizeInvalidInputException("A dataset needs a type");
  }

  const upperCased = datasetType.toUpperCase();
  const known = simPersonalizeDatasetTypes.find(
    (candidate) => candidate === upperCased,
  );

  if (known === undefined) {
    throw new SimPersonalizeInvalidInputException(
      `'${datasetType}' is not a Personalize dataset type. The types are ` +
        `${simPersonalizeDatasetTypes.join(", ")}.`,
    );
  }

  return known;
}

/**
 * The dataset types that belong to Next-Best-Action.
 *
 * Real Personalize refuses these in a Domain dataset group: "You can't create
 * next best action resources, including Actions and Action Interactions
 * datasets, in a domain dataset group." Only the custom Next-Best-Action
 * recipe uses them.
 */
const nextBestActionTypes = new Set<string>(["ACTIONS", "ACTION_INTERACTIONS"]);

/**
 * Refuse a dataset type the dataset group it is going into cannot hold.
 *
 * The domain is what decides it. A dataset group created without one is a
 * custom group and holds every type.
 */
export function requireDatasetTypeAllowed(
  datasetType: SimPersonalizeDatasetType,
  domain: string | undefined,
): void {
  if (domain === undefined || !nextBestActionTypes.has(datasetType)) {
    return;
  }

  throw new SimPersonalizeInvalidInputException(
    `A ${domain} domain dataset group cannot hold a ${datasetType} dataset. ` +
      `Next-Best-Action resources belong to a custom dataset group.`,
  );
}

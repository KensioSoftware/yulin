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

import type {
  SimPersonalizeDatasetDetail,
  SimPersonalizeDatasetSummary,
} from "../command/dataset/dataset.command.js";
import type { SimPersonalizeDataset } from "../resource/sim-personalize-dataset.js";

/**
 * A dataset as Describe reports it.
 */
export function simPersonalizeDatasetDetail(
  dataset: SimPersonalizeDataset,
): SimPersonalizeDatasetDetail {
  return {
    ...simPersonalizeDatasetSummary(dataset),
    datasetGroupArn: dataset.datasetGroupArn,
    schemaArn: dataset.schemaArn,
  };
}

/**
 * A dataset as List reports it, which leaves out the schema real Personalize
 * only reports from Describe.
 */
export function simPersonalizeDatasetSummary(
  dataset: SimPersonalizeDataset,
): SimPersonalizeDatasetSummary {
  return {
    name: dataset.name,
    datasetArn: dataset.arn,
    datasetType: dataset.datasetType,
    status: dataset.status,
    creationDateTime: dataset.creationDateTime,
    lastUpdatedDateTime: dataset.lastUpdatedDateTime,
  };
}

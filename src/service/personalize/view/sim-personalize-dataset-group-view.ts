import type {
  SimPersonalizeDatasetGroupDetail,
  SimPersonalizeDatasetGroupSummary,
} from "../command/dataset-group/dataset-group.command.js";
import type { SimPersonalizeDatasetGroup } from "../resource/sim-personalize-dataset-group.js";

/**
 * A dataset group as Describe reports it.
 */
export function simPersonalizeDatasetGroupDetail(
  group: SimPersonalizeDatasetGroup,
): SimPersonalizeDatasetGroupDetail {
  return {
    ...simPersonalizeDatasetGroupSummary(group),
    roleArn: group.roleArn,
    kmsKeyArn: group.kmsKeyArn,
  };
}

/**
 * A dataset group as List reports it, which leaves out the KMS key and the
 * role real Personalize only reports from Describe.
 */
export function simPersonalizeDatasetGroupSummary(
  group: SimPersonalizeDatasetGroup,
): SimPersonalizeDatasetGroupSummary {
  return {
    name: group.name,
    datasetGroupArn: group.arn,
    status: group.status,
    creationDateTime: group.creationDateTime,
    lastUpdatedDateTime: group.lastUpdatedDateTime,
    domain: group.domain,
  };
}

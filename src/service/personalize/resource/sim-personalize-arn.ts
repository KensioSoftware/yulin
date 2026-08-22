import { parseSimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The resource type segment of each simulated Personalize ARN.
 *
 * These are the segments real Personalize uses. A solution version has no
 * segment of its own: it is named under the solution that produced it, which
 * is why `solutionVersionArn` builds on the solution ARN rather than alongside
 * it.
 */
export const simPersonalizeResourceTypes = {
  datasetGroup: "dataset-group",
  schema: "schema",
  dataset: "dataset",
  solution: "solution",
  campaign: "campaign",
  eventTracker: "event-tracker",
} as const;

export type SimPersonalizeResourceType =
  (typeof simPersonalizeResourceTypes)[keyof typeof simPersonalizeResourceTypes];

function personalizeArn(
  resourceType: SimPersonalizeResourceType,
  resourceId: string,
  scope: SimAwsAccountRegionScope,
): string {
  return (
    `arn:aws:personalize:${scope.regionName}:${scope.accountId}:` +
    `${resourceType}/${resourceId}`
  );
}

/**
 * The ARN of one simulated dataset group.
 */
export function simPersonalizeDatasetGroupArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(simPersonalizeResourceTypes.datasetGroup, name, scope);
}

/**
 * The ARN of one simulated schema.
 */
export function simPersonalizeSchemaArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(simPersonalizeResourceTypes.schema, name, scope);
}

/**
 * The ARN of one simulated dataset.
 *
 * A dataset ARN names the dataset group it belongs to and its type, rather
 * than the name the request gave it. Two dataset groups can therefore each
 * hold an `INTERACTIONS` dataset without their ARNs colliding, and one dataset
 * group cannot hold two of the same type.
 */
export function simPersonalizeDatasetArn(
  datasetGroupName: string,
  datasetType: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(
    simPersonalizeResourceTypes.dataset,
    `${datasetGroupName}/${datasetType}`,
    scope,
  );
}

/**
 * The ARN of one simulated solution.
 */
export function simPersonalizeSolutionArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(simPersonalizeResourceTypes.solution, name, scope);
}

/**
 * The ARN of one simulated solution version.
 *
 * Real Personalize names a version under its solution, so the ARN is the
 * solution's with the version id appended.
 */
export function simPersonalizeSolutionVersionArn(
  solutionArn: string,
  versionId: string,
): string {
  return `${solutionArn}/${versionId}`;
}

/**
 * The ARN of one simulated campaign.
 */
export function simPersonalizeCampaignArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(simPersonalizeResourceTypes.campaign, name, scope);
}

/**
 * The ARN of one simulated event tracker.
 */
export function simPersonalizeEventTrackerArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return personalizeArn(simPersonalizeResourceTypes.eventTracker, name, scope);
}

/**
 * Whether a value is an ARN belonging to Personalize at all.
 *
 * Real Personalize checks the shape of an ARN before it looks anything up, and
 * reports a value of the wrong shape as invalid input rather than as a missing
 * resource. Telling the two apart is what this supports.
 */
export function isSimPersonalizeArn(value: string): boolean {
  return parseSimArn(value)?.service === "personalize";
}

import { randomUUID } from "node:crypto";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The ARN CloudFormation gives one change set.
 *
 * The unique part is a UUID, as it is for a Stack ID, so two change sets
 * created under the same name against different Stacks are still told apart by
 * their ARN alone.
 */
export function simCfnChangeSetArn(
  scope: SimAwsAccountRegionScope,
  changeSetName: string,
): string {
  const { regionName, accountId } = scope;

  return `arn:aws:cloudformation:${regionName}:${accountId}:changeSet/${changeSetName}/${randomUUID()}`;
}

import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";

/**
 * The ARN of one simulated workgroup.
 *
 * `arn:aws:athena:<region>:<account>:workgroup/<name>`. This is the resource an
 * IAM policy names for every Athena action, including the named query ones: a
 * named query has no ARN of its own, and Athena authorizes work on one against
 * the workgroup it belongs to.
 */
export function athenaWorkGroupArn(
  workGroupName: string,
  scope: SimAwsAccountRegionScope,
): string {
  return (
    `arn:aws:athena:${scope.regionName}:${scope.accountId}:` +
    `workgroup/${workGroupName}`
  );
}

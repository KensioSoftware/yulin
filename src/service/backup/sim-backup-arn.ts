import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";

/** Builds the ARN of a backup vault in the supplied scope. */
export function backupVaultArn(
  name: string,
  scope: SimAwsAccountRegionScope,
): string {
  return `arn:aws:backup:${scope.regionName}:${scope.accountId}:backup-vault:${name}`;
}

/** Builds the ARN of a backup plan in the supplied scope. */
export function backupPlanArn(
  id: string,
  scope: SimAwsAccountRegionScope,
): string {
  return `arn:aws:backup:${scope.regionName}:${scope.accountId}:backup-plan:${id}`;
}

/** Builds the ARN of a recovery point in the supplied scope. */
export function recoveryPointArn(
  id: string,
  scope: SimAwsAccountRegionScope,
): string {
  return `arn:aws:backup:${scope.regionName}:${scope.accountId}:recovery-point:${id}`;
}

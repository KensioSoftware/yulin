import { SimBackupError } from "../error/sim-backup.error.js";

export const backupVaultResourceType = "AWS::Backup::BackupVault";
export const backupPlanResourceType = "AWS::Backup::BackupPlan";
export const backupSelectionResourceType = "AWS::Backup::BackupSelection";

/** Creates an error for invalid AWS Backup CloudFormation resources. */
export function simCfnBackupResourceError(
  resourceType: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(`Invalid ${resourceType} Resource ${logicalId}: ${reason}`, {
    cause,
  });
}

/** Rewrites AWS Backup command errors with CloudFormation resource context. */
export async function simCfnBackupResourceCreation<T>(
  resourceType: string,
  logicalId: string,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof SimBackupError) {
      throw simCfnBackupResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }
    throw error;
  }
}

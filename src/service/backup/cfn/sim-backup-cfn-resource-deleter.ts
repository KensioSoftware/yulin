import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimBackupPlan } from "../plan/sim-backup-plan.js";
import type { SimBackupSelection } from "../selection/sim-backup-selection.js";
import type { SimBackup } from "../sim-backup.js";
import type { SimBackupVault } from "../vault/sim-backup-vault.js";

/** Deletes AWS Backup resources during CloudFormation stack teardown. */
export class SimBackupCfnResourceDeleter {
  constructor(private readonly backup: SimBackup) {}

  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    const simulated = resource.simResource;
    if (resourceTypeName === "BackupVault" && this.isVault(simulated)) {
      await this.backup.deleteBackupVault(
        { input: { BackupVaultName: simulated.name } },
        simCfnResourceCallerOptions(context.caller),
      );
      return;
    }
    if (resourceTypeName === "BackupPlan" && this.isPlan(simulated)) {
      this.backup.removeBackupPlan(simulated.id);
      return;
    }
    if (resourceTypeName === "BackupSelection" && this.isSelection(simulated)) {
      this.backup.removeBackupSelection(simulated.id);
    }
  }

  private isVault(value: object | undefined): value is SimBackupVault {
    return value !== undefined && "name" in value && "configureLock" in value;
  }

  private isPlan(value: object | undefined): value is SimBackupPlan {
    return value !== undefined && "versionId" in value && "rules" in value;
  }

  private isSelection(value: object | undefined): value is SimBackupSelection {
    return value !== undefined && "planId" in value && "iamRoleArn" in value;
  }
}

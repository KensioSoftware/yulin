import type {
  SimBackupPlanInput,
  SimBackupSelectionInput,
} from "../command/sim-backup-command.types.js";
import type { SimBackupVaultLockConfiguration } from "../vault/sim-backup-vault.js";
import { SimCfnBackupPlanProperties } from "./sim-cfn-backup-plan-properties.js";
import { SimCfnBackupPropertyReader } from "./sim-cfn-backup-property-reader.js";

/** Reads the CloudFormation properties supported by simulated AWS Backup. */
export class SimCfnBackupProperties extends SimCfnBackupPropertyReader {
  vaultName(): string {
    return this.requiredString("BackupVaultName");
  }

  encryptionKeyArn(): string | undefined {
    return this.string("EncryptionKeyArn");
  }

  vaultLockConfiguration(): SimBackupVaultLockConfiguration | undefined {
    const value = this.values.get("LockConfiguration");
    if (value === undefined) return undefined;
    const lock = this.record(value, "LockConfiguration");
    return {
      MinRetentionDays: this.optionalNumber(
        lock["MinRetentionDays"],
        "MinRetentionDays",
      ),
      MaxRetentionDays: this.optionalNumber(
        lock["MaxRetentionDays"],
        "MaxRetentionDays",
      ),
      ChangeableForDays: this.optionalNumber(
        lock["ChangeableForDays"],
        "ChangeableForDays",
      ),
    };
  }

  backupPlan(): SimBackupPlanInput {
    const plan = this.record(this.values.get("BackupPlan"), "BackupPlan");
    return new SimCfnBackupPlanProperties(this.resource, plan).read();
  }

  backupPlanId(): string {
    return this.requiredString("BackupPlanId");
  }

  backupSelection(): SimBackupSelectionInput {
    const selection = this.record(
      this.values.get("BackupSelection"),
      "BackupSelection",
    );
    return {
      SelectionName: this.requiredRecordString(selection, "SelectionName"),
      IamRoleArn: this.requiredRecordString(selection, "IamRoleArn"),
      Resources: this.stringArray(
        this.recordValue(selection, "Resources"),
        "Resources",
      ),
    };
  }
}

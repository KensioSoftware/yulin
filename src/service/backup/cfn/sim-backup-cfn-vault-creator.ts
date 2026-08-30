import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimBackup } from "../sim-backup.js";
import type { SimBackupVault } from "../vault/sim-backup-vault.js";
import type { SimCfnBackupProperties } from "./sim-cfn-backup-properties.js";
import {
  backupVaultResourceType,
  simCfnBackupResourceCreation,
} from "./sim-cfn-backup-resource-error.js";

/** Creates a simulated backup vault for CloudFormation. */
export async function createSimBackupVault(
  backup: SimBackup,
  resource: SimCfnResource,
  properties: SimCfnBackupProperties,
  context: SimCloudFormationResourceCreateContext,
): Promise<SimBackupVault> {
  return await simCfnBackupResourceCreation(
    backupVaultResourceType,
    resource.logicalId,
    async () => {
      const name = properties.vaultName();
      const options = simCfnResourceCallerOptions(context.caller);
      await backup.createBackupVault(
        {
          input: {
            BackupVaultName: name,
            EncryptionKeyArn: properties.encryptionKeyArn(),
          },
        },
        options,
      );
      const lock = properties.vaultLockConfiguration();
      if (lock !== undefined) {
        try {
          await backup.putBackupVaultLockConfiguration(
            { input: { BackupVaultName: name, ...lock } },
            options,
          );
        } catch (error) {
          backup.removeBackupVault(name);
          throw error;
        }
      }
      const vault = backup.findBackupVault(name);
      assertDefined(
        vault,
        `sim Backup vault ${name} after CloudFormation creation`,
      );
      return vault;
    },
  );
}

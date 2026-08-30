import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimBackupSelection } from "../selection/sim-backup-selection.js";
import type { SimBackup } from "../sim-backup.js";
import type { SimCfnBackupProperties } from "./sim-cfn-backup-properties.js";
import {
  backupSelectionResourceType,
  simCfnBackupResourceCreation,
} from "./sim-cfn-backup-resource-error.js";

/** Creates a simulated backup selection for CloudFormation. */
export async function createSimBackupSelection(
  backup: SimBackup,
  resource: SimCfnResource,
  properties: SimCfnBackupProperties,
  context: SimCloudFormationResourceCreateContext,
): Promise<SimBackupSelection> {
  return await simCfnBackupResourceCreation(
    backupSelectionResourceType,
    resource.logicalId,
    async () => {
      const created = await backup.createBackupSelection(
        {
          input: {
            BackupPlanId: properties.backupPlanId(),
            BackupSelection: properties.backupSelection(),
          },
        },
        simCfnResourceCallerOptions(context.caller),
      );
      const selection = backup.findBackupSelection(String(created.SelectionId));
      assertDefined(
        selection,
        "sim Backup selection after CloudFormation creation",
      );
      return selection;
    },
  );
}

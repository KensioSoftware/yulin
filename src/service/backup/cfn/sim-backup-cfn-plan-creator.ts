import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimBackupPlan } from "../plan/sim-backup-plan.js";
import type { SimBackup } from "../sim-backup.js";
import type { SimCfnBackupProperties } from "./sim-cfn-backup-properties.js";
import {
  backupPlanResourceType,
  simCfnBackupResourceCreation,
} from "./sim-cfn-backup-resource-error.js";

/** Creates a simulated backup plan for CloudFormation. */
export async function createSimBackupPlan(
  backup: SimBackup,
  resource: SimCfnResource,
  properties: SimCfnBackupProperties,
  context: SimCloudFormationResourceCreateContext,
): Promise<SimBackupPlan> {
  return await simCfnBackupResourceCreation(
    backupPlanResourceType,
    resource.logicalId,
    async () => {
      const created = await backup.createBackupPlan(
        { input: { BackupPlan: properties.backupPlan() } },
        simCfnResourceCallerOptions(context.caller),
      );
      const plan = backup.findBackupPlan(String(created.BackupPlanId));
      assertDefined(plan, "sim Backup plan after CloudFormation creation");
      return plan;
    },
  );
}

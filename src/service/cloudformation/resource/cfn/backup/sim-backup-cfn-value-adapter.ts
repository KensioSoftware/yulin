import { SimBackupPlan } from "../../../../backup/plan/sim-backup-plan.js";
import { SimBackupSelection } from "../../../../backup/selection/sim-backup-selection.js";
import { SimBackupVault } from "../../../../backup/vault/sim-backup-vault.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type {
  SimCfnResourceValueAdapter,
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

class SimBackupVaultCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly vault: SimBackupVault) {}

  refValue(): SimCfnTemplateValue {
    return this.vault.name;
  }

  attributeValue(name: string): SimCfnTemplateValue {
    if (name === "BackupVaultArn") return this.vault.arn;
    if (name === "BackupVaultName") return this.vault.name;
    throw new Error(`Unsupported AWS::Backup::BackupVault attribute ${name}`);
  }
}

class SimBackupPlanCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly plan: SimBackupPlan) {}

  refValue(): SimCfnTemplateValue {
    return this.plan.id;
  }

  attributeValue(name: string): SimCfnTemplateValue {
    if (name === "BackupPlanArn") return this.plan.arn;
    if (name === "BackupPlanId") return this.plan.id;
    if (name === "VersionId") return this.plan.versionId;
    throw new Error(`Unsupported AWS::Backup::BackupPlan attribute ${name}`);
  }
}

class SimBackupSelectionCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly selection: SimBackupSelection) {}

  refValue(): SimCfnTemplateValue {
    return this.selection.id;
  }

  attributeValue(name: string): SimCfnTemplateValue {
    if (name === "BackupPlanId") return this.selection.planId;
    if (name === "Id" || name === "SelectionId") return this.selection.id;
    throw new Error(
      `Unsupported AWS::Backup::BackupSelection attribute ${name}`,
    );
  }
}

/** Returns the CloudFormation value adapter for an AWS Backup resource. */
export function backupValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (properties.simResource instanceof SimBackupVault) {
    return new SimBackupVaultCfn(properties.simResource);
  }
  if (properties.simResource instanceof SimBackupPlan) {
    return new SimBackupPlanCfn(properties.simResource);
  }
  if (properties.simResource instanceof SimBackupSelection) {
    return new SimBackupSelectionCfn(properties.simResource);
  }
  return undefined;
}

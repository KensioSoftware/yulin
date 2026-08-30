import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimBackup } from "../sim-backup.js";
import { createSimBackupPlan } from "./sim-backup-cfn-plan-creator.js";
import { SimBackupCfnResourceDeleter } from "./sim-backup-cfn-resource-deleter.js";
import { createSimBackupSelection } from "./sim-backup-cfn-selection-creator.js";
import { createSimBackupVault } from "./sim-backup-cfn-vault-creator.js";
import { SimCfnBackupProperties } from "./sim-cfn-backup-properties.js";
import { simCfnBackupResourceError } from "./sim-cfn-backup-resource-error.js";

/** Creates and deletes the AWS Backup resource types supported by the simulation. */
export class SimBackupCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly deleter: SimBackupCfnResourceDeleter;

  constructor(private readonly properties: { readonly backup: SimBackup }) {
    this.deleter = new SimBackupCfnResourceDeleter(properties.backup);
  }

  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object> {
    const properties = this.read(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
    switch (resourceTypeName) {
      case "BackupVault": {
        return await createSimBackupVault(
          this.properties.backup,
          resource,
          properties,
          context,
        );
      }
      case "BackupPlan": {
        return await createSimBackupPlan(
          this.properties.backup,
          resource,
          properties,
          context,
        );
      }
      case "BackupSelection": {
        return await createSimBackupSelection(
          this.properties.backup,
          resource,
          properties,
          context,
        );
      }
      default: {
        throw simCfnBackupResourceError(
          `AWS::Backup::${resourceTypeName}`,
          resource.logicalId,
          "the Resource type is not simulated",
        );
      }
    }
  }

  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource, context);
  }

  private read(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnBackupProperties {
    return new SimCfnBackupProperties(resource, properties);
  }
}

import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimBackupRequestOptions } from "./command/sim-backup-request-options.js";
import type { SimBackupAuthorizer } from "./command/sim-backup-authorizer.js";
import { requiredString } from "./command/sim-backup-required-string.js";
import { SimBackupResourceNotFoundException } from "./error/sim-backup.error.js";
import type { SimBackupPlan } from "./plan/sim-backup-plan.js";
import type { SimBackupSelection } from "./selection/sim-backup-selection.js";
import { backupPlanArn, backupVaultArn } from "./sim-backup-arn.js";
import type { SimBackupStore } from "./sim-backup-store.js";
import type { SimBackupVault } from "./vault/sim-backup-vault.js";

interface SimBackupResourceResolverProperties {
  readonly scope: SimAwsAccountRegionScope;
  readonly authorizer: SimBackupAuthorizer;
  readonly store: SimBackupStore;
}

/** Resolves AWS Backup resources after validating the request and IAM policy. */
export class SimBackupResourceResolver {
  private readonly scope: SimAwsAccountRegionScope;
  private readonly authorizer: SimBackupAuthorizer;
  private readonly store: SimBackupStore;

  constructor(properties: SimBackupResourceResolverProperties) {
    this.scope = properties.scope;
    this.authorizer = properties.authorizer;
    this.store = properties.store;
  }

  authorizedVault(
    action: string,
    requestedName: string | undefined,
    options?: SimBackupRequestOptions,
  ): SimBackupVault {
    const name = requiredString(requestedName, "BackupVaultName");
    this.authorizer.authorize(
      action,
      backupVaultArn(name, this.scope),
      options,
    );
    return this.requireVault(name);
  }

  authorizedPlan(
    action: string,
    requestedId: string | undefined,
    options?: SimBackupRequestOptions,
  ): SimBackupPlan {
    const id = requiredString(requestedId, "BackupPlanId");
    this.authorizer.authorize(action, backupPlanArn(id, this.scope), options);
    const plan = this.store.plan(id);
    if (plan === undefined) {
      throw new SimBackupResourceNotFoundException(
        `Backup plan ${id} does not exist`,
      );
    }
    return plan;
  }

  requireVault(name: string | undefined): SimBackupVault {
    const required = requiredString(name, "TargetBackupVaultName");
    const vault = this.store.vault(required);
    if (vault === undefined) {
      throw new SimBackupResourceNotFoundException(
        `Backup vault ${required} does not exist`,
      );
    }
    return vault;
  }

  requireSelection(
    planId: string,
    requestedId: string | undefined,
  ): SimBackupSelection {
    const id = requiredString(requestedId, "SelectionId");
    const selection = this.store.selection(id);
    if (selection === undefined || selection.planId !== planId) {
      throw new SimBackupResourceNotFoundException(
        `Backup selection ${id} does not exist in plan ${planId}`,
      );
    }
    return selection;
  }
}

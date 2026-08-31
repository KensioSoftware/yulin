import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimBackupResourceNotFoundException } from "../error/sim-backup.error.js";
import type { SimBackupResourceResolver } from "../sim-backup-resource-resolver.js";
import type { SimBackupAuthorizer } from "./sim-backup-authorizer.js";
import type * as commands from "./sim-backup-command.types.js";
import type { SimBackupRequestOptions } from "./sim-backup-request-options.js";
import { requiredString } from "./sim-backup-required-string.js";

interface SimBackupRecoveryPointCommandsProperties {
  readonly background: BackgroundScheduler;
  readonly authorizer: SimBackupAuthorizer;
  readonly resolver: SimBackupResourceResolver;
}

/** Handles recovery point read commands. */
export class SimBackupRecoveryPointCommands {
  constructor(
    private readonly properties: SimBackupRecoveryPointCommandsProperties,
  ) {}

  async list(
    command: commands.SimListRecoveryPointsByBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListRecoveryPointsByBackupVaultCommandOutput> {
    const { background, resolver } = this.properties;
    await background.sequence();
    const vault = resolver.authorizedVault(
      "backup:ListRecoveryPointsByBackupVault",
      command.input.BackupVaultName,
      options,
    );
    return {
      RecoveryPoints: vault
        .recoveryPoints()
        .filter((point) => matchesPoint(point, command.input))
        .map((point) => point.describe()),
    };
  }

  async describe(
    command: commands.SimDescribeRecoveryPointCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeRecoveryPointCommandOutput> {
    const { background, authorizer, resolver } = this.properties;
    await background.sequence();
    const arn = requiredString(
      command.input.RecoveryPointArn,
      "RecoveryPointArn",
    );
    authorizer.authorize("backup:DescribeRecoveryPoint", arn, options);
    const vault = resolver.requireVault(command.input.BackupVaultName);
    const point = vault.recoveryPoint(arn);
    if (point === undefined) {
      throw new SimBackupResourceNotFoundException(
        `Recovery point ${arn} does not exist in backup vault ${vault.name}`,
      );
    }
    return point.describe();
  }
}

function matchesPoint(
  point: {
    readonly resourceArn: string;
    readonly createdBy?:
      | { readonly BackupPlanId?: string | undefined }
      | undefined;
  },
  filter: commands.SimListRecoveryPointsByBackupVaultCommand["input"],
): boolean {
  return (
    (filter.ByResourceArn === undefined ||
      point.resourceArn === filter.ByResourceArn) &&
    (filter.ByBackupPlanId === undefined ||
      point.createdBy?.BackupPlanId === filter.ByBackupPlanId)
  );
}

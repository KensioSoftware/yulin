import type {
  SimBackupJobOutput,
  SimBackupLifecycle,
  SimRecoveryPointCreator,
} from "../command/sim-backup-command.types.js";

interface SimBackupJobProperties {
  readonly accountId: string;
  readonly id: string;
  readonly vaultName: string;
  readonly vaultArn: string;
  readonly resourceArn: string;
  readonly iamRoleArn: string;
  readonly creationDate: Date;
  readonly lifecycle?: SimBackupLifecycle | undefined;
  readonly createdBy?: SimRecoveryPointCreator | undefined;
  readonly recoveryPointArn?: string | undefined;
  readonly failure?: string | undefined;
}

/** The completed result of one simulated backup attempt. */
export class SimBackupJob {
  public readonly id: string;
  public readonly vaultName: string;
  public readonly resourceArn: string;
  public readonly state: "COMPLETED" | "FAILED";

  private readonly output: SimBackupJobOutput;

  constructor(properties: SimBackupJobProperties) {
    this.id = properties.id;
    this.vaultName = properties.vaultName;
    this.resourceArn = properties.resourceArn;
    this.state = properties.failure === undefined ? "COMPLETED" : "FAILED";
    this.output = {
      AccountId: properties.accountId,
      BackupJobId: properties.id,
      BackupVaultName: properties.vaultName,
      BackupVaultArn: properties.vaultArn,
      RecoveryPointArn: properties.recoveryPointArn,
      ResourceArn: properties.resourceArn,
      CreationDate: new Date(properties.creationDate),
      InitiationDate: new Date(properties.creationDate),
      CompletionDate: new Date(properties.creationDate),
      State: this.state,
      StatusMessage: properties.failure,
      PercentDone: this.state === "COMPLETED" ? "100.0" : "0.0",
      IamRoleArn: properties.iamRoleArn,
      CreatedBy:
        properties.createdBy === undefined
          ? undefined
          : { ...properties.createdBy },
      RecoveryPointLifecycle:
        properties.lifecycle === undefined
          ? undefined
          : { ...properties.lifecycle },
      IsParent: false,
      MessageCategory:
        this.state === "COMPLETED" ? "SUCCESS" : "InvalidParameters",
    };
  }

  describe(): SimBackupJobOutput {
    return {
      ...this.output,
      CreationDate: cloneDate(this.output.CreationDate),
      InitiationDate: cloneDate(this.output.InitiationDate),
      CompletionDate: cloneDate(this.output.CompletionDate),
      CreatedBy:
        this.output.CreatedBy === undefined
          ? undefined
          : { ...this.output.CreatedBy },
      RecoveryPointLifecycle:
        this.output.RecoveryPointLifecycle === undefined
          ? undefined
          : { ...this.output.RecoveryPointLifecycle },
    };
  }
}

function cloneDate(date: Date | undefined): Date | undefined {
  return date === undefined ? undefined : new Date(date);
}

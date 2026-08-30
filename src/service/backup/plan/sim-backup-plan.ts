import type {
  SimBackupPlanInput,
  SimBackupRule,
  SimGetBackupPlanCommandOutput,
} from "../command/sim-backup-command.types.js";
import { requiredString } from "../command/sim-backup-required-string.js";
import { readBackupRules } from "./sim-backup-rule.js";

interface SimBackupPlanProperties {
  readonly id: string;
  readonly arn: string;
  readonly versionId: string;
  readonly creationDate: Date;
  readonly creatorRequestId?: string | undefined;
  readonly plan: SimBackupPlanInput;
}

/** Stores one simulated AWS Backup plan. */
export class SimBackupPlan {
  public readonly id: string;
  public readonly arn: string;
  public readonly versionId: string;
  public readonly creationDate: Date;
  public readonly creatorRequestId?: string | undefined;
  public readonly name: string;
  public readonly rules: readonly SimBackupRule[];

  constructor(properties: SimBackupPlanProperties) {
    this.id = properties.id;
    this.arn = properties.arn;
    this.versionId = properties.versionId;
    this.creationDate = new Date(properties.creationDate);
    this.creatorRequestId = properties.creatorRequestId;
    this.name = requiredString(
      properties.plan.BackupPlanName,
      "BackupPlanName",
    );
    this.rules = readBackupRules(properties.plan.Rules);
  }

  describe(): SimGetBackupPlanCommandOutput {
    return {
      BackupPlan: {
        BackupPlanName: this.name,
        Rules: this.rules.map((rule) => ({
          ...rule,
          Lifecycle:
            rule.Lifecycle === undefined ? undefined : { ...rule.Lifecycle },
        })),
      },
      BackupPlanId: this.id,
      BackupPlanArn: this.arn,
      VersionId: this.versionId,
      CreatorRequestId: this.creatorRequestId,
      CreationDate: new Date(this.creationDate),
    };
  }
}

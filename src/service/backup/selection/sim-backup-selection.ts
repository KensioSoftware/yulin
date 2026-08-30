import type {
  SimBackupSelectionInput,
  SimBackupSelectionListMember,
  SimGetBackupSelectionCommandOutput,
} from "../command/sim-backup-command.types.js";
import { requiredString } from "../command/sim-backup-required-string.js";

interface SimBackupSelectionProperties {
  readonly id: string;
  readonly planId: string;
  readonly creationDate: Date;
  readonly creatorRequestId?: string | undefined;
  readonly selection: SimBackupSelectionInput;
}

/**
 *
 */
export class SimBackupSelection {
  public readonly id: string;
  public readonly planId: string;
  public readonly creationDate: Date;
  public readonly creatorRequestId?: string | undefined;
  public readonly name: string;
  public readonly iamRoleArn: string;
  public readonly resources: readonly string[];

  constructor(properties: SimBackupSelectionProperties) {
    this.id = properties.id;
    this.planId = properties.planId;
    this.creationDate = new Date(properties.creationDate);
    this.creatorRequestId = properties.creatorRequestId;
    this.name = requiredString(
      properties.selection.SelectionName,
      "SelectionName",
    );
    this.iamRoleArn = requiredString(
      properties.selection.IamRoleArn,
      "IamRoleArn",
    );
    this.resources = [...(properties.selection.Resources ?? [])];
  }

  describe(): SimGetBackupSelectionCommandOutput {
    return {
      BackupSelection: {
        SelectionName: this.name,
        IamRoleArn: this.iamRoleArn,
        Resources: [...this.resources],
      },
      SelectionId: this.id,
      BackupPlanId: this.planId,
      CreationDate: new Date(this.creationDate),
      CreatorRequestId: this.creatorRequestId,
    };
  }

  listMember(): SimBackupSelectionListMember {
    return {
      SelectionId: this.id,
      SelectionName: this.name,
      BackupPlanId: this.planId,
      CreationDate: new Date(this.creationDate),
      CreatorRequestId: this.creatorRequestId,
      IamRoleArn: this.iamRoleArn,
    };
  }
}

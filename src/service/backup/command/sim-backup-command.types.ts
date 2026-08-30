export interface SimBackupLifecycle {
  readonly MoveToColdStorageAfterDays?: number | undefined;
  readonly DeleteAfterDays?: number | undefined;
}

export interface SimBackupRuleInput {
  readonly RuleName?: string | undefined;
  readonly TargetBackupVaultName?: string | undefined;
  readonly ScheduleExpression?: string | undefined;
  readonly Lifecycle?: SimBackupLifecycle | undefined;
}

export interface SimBackupRule extends SimBackupRuleInput {
  readonly RuleId?: string | undefined;
}

export interface SimBackupPlanInput {
  readonly BackupPlanName?: string | undefined;
  readonly Rules?: readonly SimBackupRuleInput[] | undefined;
}

export interface SimBackupSelectionInput {
  readonly SelectionName?: string | undefined;
  readonly IamRoleArn?: string | undefined;
  readonly Resources?: readonly string[] | undefined;
}

export interface SimBackupCommand<Input> {
  readonly input: Input;
}

export type SimCreateBackupVaultCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultTags?: Readonly<Record<string, string>> | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupVaultCommandOutput {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimDescribeBackupVaultCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
}>;

export interface SimDescribeBackupVaultCommandOutput {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly NumberOfRecoveryPoints?: number | undefined;
  readonly Locked?: boolean | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly LockDate?: Date | undefined;
}

export type SimDeleteBackupVaultCommand = SimDescribeBackupVaultCommand;
export type SimDeleteBackupVaultCommandOutput = object;

export type SimListBackupVaultsCommand = SimBackupCommand<{
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimBackupVaultListMember {
  readonly BackupVaultName?: string | undefined;
  readonly BackupVaultArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly EncryptionKeyArn?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly NumberOfRecoveryPoints?: number | undefined;
  readonly Locked?: boolean | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly LockDate?: Date | undefined;
}

export interface SimListBackupVaultsCommandOutput {
  readonly BackupVaultList?: readonly SimBackupVaultListMember[] | undefined;
  readonly NextToken?: string | undefined;
}

export type SimPutBackupVaultLockConfigurationCommand = SimBackupCommand<{
  readonly BackupVaultName?: string | undefined;
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly ChangeableForDays?: number | undefined;
}>;
export type SimPutBackupVaultLockConfigurationCommandOutput = object;

export type SimCreateBackupPlanCommand = SimBackupCommand<{
  readonly BackupPlan?: SimBackupPlanInput | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupPlanCommandOutput {
  readonly BackupPlanId?: string | undefined;
  readonly BackupPlanArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly VersionId?: string | undefined;
}

export type SimGetBackupPlanCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly VersionId?: string | undefined;
}>;

export interface SimGetBackupPlanCommandOutput {
  readonly BackupPlan?: {
    readonly BackupPlanName?: string | undefined;
    readonly Rules?: readonly SimBackupRule[] | undefined;
  };
  readonly BackupPlanId?: string | undefined;
  readonly BackupPlanArn?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimCreateBackupSelectionCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly BackupSelection?: SimBackupSelectionInput | undefined;
  readonly CreatorRequestId?: string | undefined;
}>;

export interface SimCreateBackupSelectionCommandOutput {
  readonly SelectionId?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
}

export type SimGetBackupSelectionCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly SelectionId?: string | undefined;
}>;

export interface SimGetBackupSelectionCommandOutput {
  readonly BackupSelection?: SimBackupSelectionInput | undefined;
  readonly SelectionId?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
}

export type SimListBackupSelectionsCommand = SimBackupCommand<{
  readonly BackupPlanId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}>;

export interface SimBackupSelectionListMember {
  readonly SelectionId?: string | undefined;
  readonly SelectionName?: string | undefined;
  readonly BackupPlanId?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly CreatorRequestId?: string | undefined;
  readonly IamRoleArn?: string | undefined;
}

export interface SimListBackupSelectionsCommandOutput {
  readonly BackupSelectionsList?:
    | readonly SimBackupSelectionListMember[]
    | undefined;
  readonly NextToken?: string | undefined;
}
